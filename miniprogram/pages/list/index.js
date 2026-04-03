const app = getApp();
const dbUtil = require('../../utils/db.js');
const listUtil = require('../../utils/listUtil.js');

Page({
  data: {
    activeView: 'planning', // 'planning' | 'execution'
    planningGroups: [],
    executionGroups: [],
    listId: null,
    loading: true,
    i18n: {},
    lang: 'zh',
    
    // Tutorial Sheet State
    showTutorialSheet: false,
    tutorialLoading: false,
    tutorialError: false,
    tutorialErrorMsg: '',
    tutorials: [],
    currentTutorialKeyword: '',
    tutorialPlatform: 'bilibili',
    newIngredients: {}, // { 'recipeName': 'ingredientName' }
    newOtherIngredient: ''
  },

  onLoad() {
    this.setData({ 
      i18n: app.globalData.i18n,
      lang: app.globalData.language
    });
  },

  async onShow() {
    this.setData({ 
      i18n: app.globalData.i18n,
      lang: app.globalData.language
    });
    wx.setNavigationBarTitle({ title: app.t('page_title_list') || '采购清单' });
    
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_list') || '清单' });
      wx.setTabBarItem({ index: 2, text: app.t('tab_my') });
    }

    await this.loadActiveList();
  },

  async loadActiveList(showLoading = true) {
    if (showLoading) {
      this.setData({ loading: true });
    }
    try {
      const listId = await dbUtil.getActiveList();
      this.setData({ listId });
      
      const countRes = await dbUtil.db.collection(dbUtil.COLLECTIONS.INGREDIENTS)
        .where({
          list_id: listId,
          status: dbUtil.db.command.neq('deleted')
        }).count();
      const total = countRes.total;
      
      let allIngredients = [];
      const MAX_LIMIT = 20;
      
      for (let i = 0; i < total; i += MAX_LIMIT) {
        const res = await dbUtil.db.collection(dbUtil.COLLECTIONS.INGREDIENTS)
          .where({
            list_id: listId,
            status: dbUtil.db.command.neq('deleted')
          })
          .orderBy('add_time', 'desc')
          .skip(i)
          .limit(MAX_LIMIT)
          .get();
        allIngredients = allIngredients.concat(res.data || []);
      }
        
      const ingredients = allIngredients;
      this._rawIngredients = ingredients;
      
      const planningGroups = listUtil.derivePlanningView(ingredients);
      const executionGroups = listUtil.deriveExecutionView(ingredients);
      
      this.setData({
        planningGroups,
        executionGroups,
        loading: false
      });
    } catch (err) {
      console.error('Failed to load list:', err);
      this.setData({ loading: false });
    }
  },

  finishPurchasing() {
    wx.showModal({
      title: this.data.i18n.title_finish_purchase || '结束采购',
      content: this.data.i18n.content_finish_purchase || '确认结束本次采购吗？未勾选的食材将保留在历史记录中，并开启新的采购清单。',
      confirmText: this.data.i18n.confirm_finish || '确认结束',
      cancelText: this.data.i18n.cancel || '取消',
      confirmColor: '#4b6338',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: this.data.i18n.saving || '正在保存...' });
          try {
            // 1. 将所有 active 状态的清单都置为 completed (防范后台存在多条脏数据导致表面清不空)
            const activeListsRes = await dbUtil.db.collection(dbUtil.COLLECTIONS.SHOPPING_LISTS)
              .where({ status: 'active' })
              .get();

            const activeLists = activeListsRes.data || [];
            const promises = activeLists.map(list => {
              return dbUtil.db.collection(dbUtil.COLLECTIONS.SHOPPING_LISTS)
                .doc(list._id)
                .update({
                  data: { status: 'completed' }
                });
            });

            // 兜底：如果当前 listId 不在上述查询结果中，也强制更新
            if (this.data.listId && !activeLists.find(l => l._id === this.data.listId)) {
              promises.push(
                dbUtil.db.collection(dbUtil.COLLECTIONS.SHOPPING_LISTS)
                  .doc(this.data.listId)
                  .update({
                    data: { status: 'completed' }
                  })
              );
            }

            await Promise.all(promises);

            // 2. 强制清空前端数据视图，给予用户即时的“清空”反馈
            this._rawIngredients = [];
            this.setData({
              planningGroups: [],
              executionGroups: [],
              listId: null
            });

            // 3. 重新加载，此时必定会创建一个全新的空白清单
            await this.loadActiveList(true);

            wx.hideLoading();
            wx.showToast({
              title: this.data.i18n.purchase_finished || '采购已结束',
              icon: 'success'
            });
          } catch (err) {
            console.error('Failed to finish purchasing:', err);
            wx.hideLoading();
            wx.showToast({
              title: this.data.i18n.save_failed || '保存失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  toggleView() {
    this.setData({
      activeView: this.data.activeView === 'planning' ? 'execution' : 'planning'
    });
  },

  // --- Swipe to Delete Recipe Logic ---
  touchstart(e) {
    if (this.data.activeView !== 'planning') return;
    this.startX = e.changedTouches[0].clientX;
    this.startY = e.changedTouches[0].clientY;
  },

  touchend(e) {
    if (this.data.activeView !== 'planning') return;
    const index = e.currentTarget.dataset.index;
    const startX = this.startX;
    const startY = this.startY;
    const touchX = e.changedTouches[0].clientX;
    const touchY = e.changedTouches[0].clientY;
    
    // Prevent if scrolling vertically
    if (Math.abs(touchY - startY) > Math.abs(touchX - startX)) {
      return;
    }
    
    const planningGroups = this.data.planningGroups;
    
    if (startX - touchX > 30) { 
      // Swipe left - reveal delete button
      planningGroups.forEach((group, i) => {
        group.isTouchMove = i === index;
      });
      this.setData({ planningGroups });
    } else if (touchX - startX > 30) { 
      // Swipe right - hide delete button
      planningGroups[index].isTouchMove = false;
      this.setData({ planningGroups });
    }
  },

  showExecutionEditToast() {
    wx.showToast({
      title: '如需修改或删除，请切换至“逐道菜选购”操作',
      icon: 'none',
      duration: 2000
    });
  },

  async toggleIngredientStatus(e) {
    const { id, ids, current } = e.currentTarget.dataset;
    const newStatus = current === 'bought' ? 'pending' : 'bought';
    
    // 乐观更新 UI
    if (this._rawIngredients) {
      const updatedIngredients = this._rawIngredients.map(item => {
        if (id && item._id === id) {
          return { ...item, status: newStatus };
        }
        if (ids && ids.includes(item._id)) {
          return { ...item, status: newStatus };
        }
        return item;
      });
      
      this._rawIngredients = updatedIngredients;
      
      const planningGroups = listUtil.derivePlanningView(updatedIngredients);
      const executionGroups = listUtil.deriveExecutionView(updatedIngredients);
      
      this.setData({
        planningGroups,
        executionGroups
      });
    }

    try {
      const db = dbUtil.db;
      if (ids && ids.length > 0) {
        // Update multiple (execution view)
        const promises = ids.map(_id => 
          db.collection(dbUtil.COLLECTIONS.INGREDIENTS).doc(_id).update({
            data: { status: newStatus }
          })
        );
        await Promise.all(promises);
      } else if (id) {
        // Update single (planning view)
        await db.collection(dbUtil.COLLECTIONS.INGREDIENTS).doc(id).update({
          data: { status: newStatus }
        });
      }
      
      // 后台静默刷新，不显示 loading
      this.loadActiveList(false);
    } catch (err) {
      console.error('Toggle status failed:', err);
      // 失败后回滚 UI
      this.loadActiveList(false);
    }
  },

  async deleteIngredient(e) {
    const { id, ids } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除食材',
      content: '确认删除？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = dbUtil.db;
            if (ids && ids.length > 0) {
              const promises = ids.map(_id => 
                db.collection(dbUtil.COLLECTIONS.INGREDIENTS).doc(_id).update({
                  data: { status: 'deleted' }
                })
              );
              await Promise.all(promises);
            } else if (id) {
              await db.collection(dbUtil.COLLECTIONS.INGREDIENTS).doc(id).update({
                data: { status: 'deleted' }
              });
            }
            this.loadActiveList(false);
          } catch (err) {
            console.error('Delete failed:', err);
          }
        }
      }
    });
  },

  async deleteRecipe(e) {
    const { recipe } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除整道菜',
      content: `确认删除【${recipe}】下的所有食材吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = dbUtil.db;
            const _ = db.command;
            await db.collection(dbUtil.COLLECTIONS.INGREDIENTS).where({
              list_id: this.data.listId,
              source_recipe: recipe
            }).update({
              data: { status: 'deleted' }
            });
            this.loadActiveList(false);
          } catch (err) {
            console.error('Delete recipe failed:', err);
          }
        } else {
          // If cancelled, reset swipe state
          const planningGroups = this.data.planningGroups.map(group => ({
            ...group,
            isTouchMove: false
          }));
          this.setData({ planningGroups });
        }
      }
    });
  },

  async handleMerge(e) {
    const { source, target, targetname, sourcename } = e.currentTarget.dataset;
    wx.showModal({
      title: '智能合并提示',
      content: `AI发现 [${sourcename}] 和 [${targetname}] 可能是同类计划，合并为 [${targetname}] 还是 [保持分开]？`,
      confirmText: '合并',
      cancelText: '保持分开',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = dbUtil.db;
            // 将 source 中的所有食材 standard_name 修改为 targetname
            const promises = source.map(_id => 
              db.collection(dbUtil.COLLECTIONS.INGREDIENTS).doc(_id).update({
                data: { standard_name: targetname }
              })
            );
            await Promise.all(promises);
            this.loadActiveList(false);
          } catch (err) {
            console.error('Merge failed:', err);
          }
        }
      }
    });
  },

  onAddIngredientInput(e) {
    const { recipe } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`newIngredients.${recipe}`]: value
    });
  },

  showAddRecipeModal() {
    wx.showModal({
      title: '添加菜谱/菜品',
      editable: true,
      placeholderText: '请输入名称 (如: 辣椒炒肉)',
      success: (res) => {
        if (res.confirm && res.content) {
          const dishName = res.content.trim();
          if (dishName) {
            const exists = this.data.planningGroups.find(g => g.title === dishName);
            if (exists) {
              wx.showToast({ title: '已存在该菜谱', icon: 'none' });
              return;
            }
            
            // Push a temporary empty group to UI
            const newGroup = {
              title: dishName,
              items: [],
              isCustom: true
            };
            
            this.setData({
              planningGroups: [...this.data.planningGroups, newGroup]
            });
            
            // Scroll to the bottom to see the new group
            wx.pageScrollTo({
              scrollTop: 99999,
              duration: 300
            });
          }
        }
      }
    });
  },

  async addIngredientToRecipe(e) {
    const { recipe } = e.currentTarget.dataset;
    const name = e.detail.value?.trim();
    if (!name) return;

    try {
      wx.showLoading({ title: '添加中...', mask: true });
      
      const ingredientData = {
        name: name,
        source_recipe: recipe,
        status: 'pending',
        list_id: this.data.listId,
        add_time: dbUtil.db.serverDate(),
        standard_name: name,
        category: 'other'
      };

      await dbUtil.db.collection(dbUtil.COLLECTIONS.INGREDIENTS).add({
        data: ingredientData
      });

      // Clear input
      this.setData({
        [`newIngredients.${recipe}`]: ''
      });

      wx.hideLoading();
      this.loadActiveList(false);
    } catch (err) {
      console.error('Add ingredient failed:', err);
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  onAddOtherIngredientInput(e) {
    this.setData({
      newOtherIngredient: e.detail.value
    });
  },

  async addOtherIngredient(e) {
    const name = e.detail.value?.trim();
    if (!name) return;

    try {
      wx.showLoading({ title: '添加中...', mask: true });
      
      const ingredientData = {
        name: name,
        source_recipe: '其他',
        status: 'pending',
        list_id: this.data.listId,
        add_time: dbUtil.db.serverDate(),
        standard_name: name,
        category: 'other'
      };

      await dbUtil.db.collection(dbUtil.COLLECTIONS.INGREDIENTS).add({
        data: ingredientData
      });

      this.setData({
        newOtherIngredient: ''
      });

      wx.hideLoading();
      this.loadActiveList(false);
    } catch (err) {
      console.error('Add other ingredient failed:', err);
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  editOtherIngredient(e) {
    const { ids, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '编辑食材',
      editable: true,
      content: name,
      placeholderText: '请输入新食材名称',
      success: async (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim();
          if (newName && newName !== name) {
            try {
              wx.showLoading({ title: '保存中...', mask: true });
              const db = dbUtil.db;
              const promises = ids.map(_id => 
                db.collection(dbUtil.COLLECTIONS.INGREDIENTS).doc(_id).update({
                  data: { name: newName, standard_name: newName }
                })
              );
              await Promise.all(promises);
              wx.hideLoading();
              this.loadActiveList(false);
            } catch (err) {
              console.error('Update failed:', err);
              wx.hideLoading();
            }
          }
        }
      }
    });
  },

  // --- 视频做法检索功能 ---
  searchTutorial(e) {
    const keyword = e.currentTarget.dataset.recipe;
    const platform = e.currentTarget.dataset.platform || 'bilibili';
    if (!keyword) return;

    this.setData({
      showTutorialSheet: true,
      tutorialLoading: true,
      tutorialError: false,
      tutorialErrorMsg: '',
      tutorials: [],
      currentTutorialKeyword: keyword,
      tutorialPlatform: platform
    });

    this.fetchTutorials(keyword, platform);
  },

  async fetchTutorials(keyword, platform) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'analyze',
        data: {
          action: 'search_tutorial',
          keyword: keyword,
          lang: app.globalData.language
        }
      });

      if (res.result && !res.result.error && res.result.data) {
        const results = res.result.data[platform];
        if (results && results.length > 0) {
          this.setData({
            tutorialLoading: false,
            tutorials: results
          });
        } else {
          throw new Error('Empty response for ' + platform);
        }
      } else {
        throw new Error(res.result?.message || 'Empty response');
      }
    } catch (err) {
      console.error('Fetch tutorials failed:', err);
      this.setData({
        tutorialLoading: false,
        tutorialError: true,
        tutorialErrorMsg: app.t('err_cloud_func')
      });
    }
  },

  retryTutorial() {
    if (this.data.currentTutorialKeyword) {
      this.setData({
        tutorialLoading: true,
        tutorialError: false
      });
      this.fetchTutorials(this.data.currentTutorialKeyword, this.data.tutorialPlatform);
    }
  },

  closeTutorialSheet() {
    this.setData({
      showTutorialSheet: false
    });
  },

  openTutorialLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;

    const app = getApp();
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: app.t('tutorial_copy_success'),
          icon: 'none',
          duration: 3000
        });
      },
      fail: () => {
        wx.showToast({
          title: app.t('tutorial_copy_fail'),
          icon: 'none'
        });
      }
    });
  }
});
