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
    wx.setNavigationBarTitle({ title: app.t('page_title_list') });
    
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_list') });
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
      
      const list = await dbUtil.getListById(listId);
      let ingredients = [];
      if (list && list.items) {
        ingredients = list.items;
      }
      
      this._rawIngredients = ingredients;
      
      const planningGroups = listUtil.derivePlanningView(ingredients);
      const executionGroups = listUtil.deriveExecutionView(ingredients);
      
      // 检查当前用户已收藏的菜谱，用于点亮红心
      let savedRecipesMap = {};
      const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
      if (authSource === 'cloud_openid' && wx.cloud) {
        try {
          const db = wx.cloud.database();
          const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
          // 获取当前列表中所有的菜谱名
          const recipeNames = planningGroups.map(g => g.title).filter(title => title && title !== 'list_independent_ingredients' && title !== 'list_other_ingredients' && title !== 'list_direct_add');
          if (recipeNames.length > 0) {
             const _ = db.command;
             const { data: savedData } = await db.collection('recipes').where({
               _openid: userId,
               recipeName: _.in(recipeNames)
             }).get();
             savedData.forEach(item => {
               savedRecipesMap[item.recipeName] = true;
             });
          }
        } catch (err) {
          console.error('Failed to check saved recipes:', err);
        }
      }

      this.setData({
        planningGroups,
        executionGroups,
        savedRecipesMap,
        loading: false
      });
    } catch (err) {
      console.error('Failed to load list:', err);
      this.setData({ loading: false });
    }
  },

  finishPurchasing() {
    wx.showModal({
      title: this.data.i18n.title_finish_purchase,
      content: this.data.i18n.content_finish_purchase,
      confirmText: this.data.i18n.confirm_finish,
      cancelText: this.data.i18n.cancel,
      confirmColor: '#4b6338',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: this.data.i18n.saving });
          try {
            // 1. 将当前用户的所有 active 状态的清单都置为 completed (防范后台存在多条脏数据导致表面清不空)
            const auth = require('../../utils/auth.js');
            const userId = auth.getUserId();
            const _ = dbUtil.db.command;
            
            const query = userId ? _.and([
              { status: 'active' },
              _.or([
                { _openid: userId },
                { user_id: userId }
              ])
            ]) : { status: 'active', user_id: 'unauthenticated' };

            const activeListsRes = await dbUtil.db.collection(dbUtil.COLLECTIONS.SHOPPING_LISTS)
              .where(query)
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
              title: this.data.i18n.purchase_finished,
              icon: 'success'
            });
          } catch (err) {
            console.error('Failed to finish purchasing:', err);
            wx.hideLoading();
            wx.showToast({
              title: this.data.i18n.save_failed,
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
      title: app.t('list_edit_hint'),
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
        if (id && item.id === id) {
          return { ...item, status: newStatus };
        }
        if (ids && ids.includes(item.id)) {
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
      const targetIds = ids && ids.length > 0 ? ids : [id];
      await dbUtil.updateIngredientStatus(this.data.listId, targetIds, newStatus);
      
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
      title: app.t('list_delete_ingredient'),
      content: app.t('list_confirm_delete'),
      success: async (res) => {
        if (res.confirm) {
          try {
            const targetIds = ids && ids.length > 0 ? ids : [id];
            await dbUtil.deleteIngredients(this.data.listId, targetIds);
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
      title: app.t('list_delete_recipe'),
      content: app.t('list_delete_recipe_confirm').replace('{recipe}', recipe),
      success: async (res) => {
        if (res.confirm) {
          try {
            await dbUtil.deleteRecipe(this.data.listId, recipe);
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

  async saveRecipe(e) {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid' || !wx.cloud) {
      wx.showToast({ title: this.data.i18n.my_err_cloud_user, icon: 'none' });
      return;
    }

    const title = e.currentTarget.dataset.recipe;
    const items = e.currentTarget.dataset.items;
    if (!title || !items) return;

    // 如果已经是收藏状态，这里可以选择执行取消收藏，目前按您的要求只做添加逻辑
    if (this.data.savedRecipesMap && this.data.savedRecipesMap[title]) {
       wx.showToast({ title: app.t('list_saved'), icon: 'none' });
       return;
    }

    wx.showLoading({ title: app.t('recipe_saving'), mask: true });

    try {
      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');

      await db.collection('recipes').add({
        data: {
          recipeName: title,
          ingredientName: title, 
          ingredientsNeeded: items.map(ing => ing.name),
          sourceType: 'familiar', 
          cloudImagePath: '',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });

      // 更新本地状态，点亮红心
      this.setData({
        [`savedRecipesMap.${title}`]: true
      });

      wx.hideLoading();
      wx.showToast({ title: app.t('recipe_saved_success'), icon: 'success' });
    } catch (err) {
      console.error('收藏食谱失败:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('recipe_save_failed'), icon: 'none' });
    }
  },

  async handleMerge(e) {
    const { source, target, targetname, sourcename } = e.currentTarget.dataset;
    wx.showModal({
      title: app.t('list_merge_hint'),
      content: app.t('list_merge_confirm_content').replace('{source}', sourcename).replace('{target}', targetname).replace('{target}', targetname),
      confirmText: app.t('list_merge_confirm_yes'),
      cancelText: app.t('list_merge_confirm_no'),
      success: async (res) => {
        if (res.confirm) {
          try {
            await dbUtil.updateIngredientName(this.data.listId, source, targetname);
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
      title: app.t('list_add_recipe_title'),
      editable: true,
      placeholderText: app.t('list_add_recipe_placeholder'),
      success: (res) => {
        if (res.confirm && res.content) {
          const dishName = res.content.trim();
          if (dishName) {
            const exists = this.data.planningGroups.find(g => g.title === dishName);
            if (exists) {
              wx.showToast({ title: app.t('list_recipe_exists'), icon: 'none' });
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
      wx.showLoading({ title: app.t('recipe_adding'), mask: true });

      const ingredientData = {
        name: name,
        sourceRecipe: recipe,
        standardName: name,
        category: 'list_other_ingredients'
      };

      await dbUtil.addIngredientsToList(this.data.listId, [ingredientData]);

      // Clear input
      this.setData({
        [`newIngredients.${recipe}`]: ''
      });

      wx.hideLoading();
      this.loadActiveList(false);
    } catch (err) {
      console.error('Add ingredient failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('err_add_failed'), icon: 'none' });
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
      wx.showLoading({ title: app.t('recipe_adding'), mask: true });

      const ingredientData = {
        name: name,
        sourceRecipe: 'list_other_ingredients',
        standardName: name,
        category: 'list_other_ingredients'
      };

      await dbUtil.addIngredientsToList(this.data.listId, [ingredientData]);

      this.setData({
        newOtherIngredient: ''
      });

      wx.hideLoading();
      this.loadActiveList(false);
    } catch (err) {
      console.error('Add other ingredient failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('err_add_failed'), icon: 'none' });
    }
  },

  editOtherIngredient(e) {
    const { ids, name } = e.currentTarget.dataset;
    wx.showModal({
      title: app.t('list_edit_ingredient_title'),
      editable: true,
      content: name,
      placeholderText: app.t('list_edit_ingredient_placeholder'),
      success: async (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim();
          if (newName && newName !== name) {
            try {
              wx.showLoading({ title: app.t('list_saving'), mask: true });
              await dbUtil.updateIngredientName(this.data.listId, ids, newName);
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
