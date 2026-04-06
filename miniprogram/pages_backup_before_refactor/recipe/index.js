const app = getApp();
const dbUtil = require('../../utils/db.js');

Page({
  data: {
    recipeName: '',
    ingredients: [],
    ingredientName: '',
    sourceType: 'familiar',
    imagePath: '',
    cloudImagePath: '',
    loading: true,
    isSaved: false,
    i18n: {},
    lang: 'zh',
    showTutorialSheet: false,
    tutorialLoading: false,
    tutorialError: false,
    tutorialErrorMsg: '',
    tutorials: [],
    currentTutorialKeyword: '',
    tutorialPlatform: 'bilibili'
  },

  onLoad(options) {
    if (options.data) {
      try {
        const data = JSON.parse(decodeURIComponent(options.data));
        this.setData({ 
          recipeName: data.recipeName,
          ingredients: data.ingredients || [],
          ingredientName: data.ingredientName || data.recipeName,
          sourceType: data.sourceType || 'familiar',
          imagePath: data.imagePath || '',
          cloudImagePath: data.cloudImagePath || ''
        });
      } catch (e) {
        console.error('Failed to parse recipe data:', e);
      }
    } else if (options.name) {
      this.setData({ recipeName: decodeURIComponent(options.name) });
    }
    this.setData({ 
      i18n: app.globalData.i18n,
      lang: app.globalData.language
    });
    wx.setNavigationBarTitle({ title: this.data.recipeName === 'list_independent_ingredients' ? app.t('list_independent_ingredients') : (this.data.recipeName || app.t('recipe_title_default')) });
  },

  async onShow() {
    await this.loadRecipeDetails();
  },

  async loadRecipeDetails() {
    this.setData({ loading: true });
    try {
      const db = dbUtil.db;
      const _ = db.command;
      const $ = db.command.aggregate;
      const userId = app.globalData.openid || wx.getStorageSync('pf_user_id');

      // Get unique ingredients for this recipe, picking the latest status and docId
      const res = await db.collection(dbUtil.COLLECTIONS.SHOPPING_LISTS).aggregate()
        .match({
          _openid: userId,
          'items.sourceRecipe': this.data.recipeName
        })
        .unwind('$items')
        .match({
          'items.sourceRecipe': this.data.recipeName,
          'items.status': _.neq('deleted')
        })
        .group({
          _id: '$items.name',
          docId: $.last('$_id'),
          itemId: $.last('$items.id'),
          status: $.last('$items.status'),
          createdAt: $.max('$items.createdAt')
        })
        .sort({ createdAt: -1 })
        .end();

      const dbIngredients = (res.list || []).map(item => ({
        _id: item.docId,
        itemId: item.itemId,
        name: item._id,
        status: item.status
      }));

      // Filter out deleted ingredients from the local state
      const validHistoricalIngredients = this.data.ingredients.filter(ing => {
        // Keep it if it has no _id (historical)
        if (!ing._id) return true;
        // Or if it's still in the DB results
        return dbIngredients.some(dbIng => dbIng._id === ing._id);
      });

      const mergedIngredients = [...validHistoricalIngredients];
      
      dbIngredients.forEach(dbIng => {
        const existingIndex = mergedIngredients.findIndex(ing => ing.name === dbIng.name);
        if (existingIndex !== -1) {
          mergedIngredients[existingIndex] = dbIng;
        } else {
          mergedIngredients.push(dbIng);
        }
      });

      // 检查是否已收藏
      let isSaved = false;
      try {
        const { data: existing } = await db.collection('recipes').where({
          _openid: userId,
          recipeName: this.data.recipeName
        }).get();
        if (existing && existing.length > 0) {
          isSaved = true;
        }
      } catch (err) {
        console.error('Check saved recipe failed:', err);
      }

      this.setData({ ingredients: mergedIngredients, isSaved, loading: false });
    } catch (err) {
      console.error('Failed to load recipe details:', err);
      this.setData({ loading: false });
    }
  },

  async deleteIngredient(e) {
    const { id, itemid } = e.currentTarget.dataset;
    if (!id) {
      // 本地假数据直接删除
      const updatedIngredients = this.data.ingredients.filter(item => item.name !== e.currentTarget.dataset.name);
      this.setData({ ingredients: updatedIngredients });
      return;
    }

    wx.showModal({
      title: app.t('recipe_delete_ingredient'),
      content: app.t('recipe_confirm_delete'),
      success: async (res) => {
        if (res.confirm) {
          try {
            if (itemid) {
              await dbUtil.deleteIngredients(id, [itemid]);
            }
            this.loadRecipeDetails();
          } catch (err) {
            console.error('Delete failed:', err);
          }
        }
      }
    });
  },

  async addAllToNewList() {
    if (!this.data.ingredients || this.data.ingredients.length === 0) {
      wx.showToast({ title: app.t('recipe_no_ingredient'), icon: 'none' });
      return;
    }

    wx.showLoading({ title: app.t('recipe_adding') });
    try {
      const activeListId = await dbUtil.getActiveList();
      const itemsToAdd = this.data.ingredients.map(ing => ({
        name: ing.name,
        standardName: ing.name,
        category: 'list_other_ingredients',
        sourceRecipe: this.data.recipeName
      }));
      
      // 添加主食材，如果是在识物流程中传入的
      if (this.data.ingredientName && this.data.ingredientName !== this.data.recipeName) {
        itemsToAdd.push({
          name: this.data.ingredientName,
          standardName: this.data.ingredientName,
          category: 'list_other_ingredients',
          sourceRecipe: this.data.recipeName
        });
      }
      
      await dbUtil.addIngredientsToList(activeListId, itemsToAdd);
      wx.hideLoading();
      wx.showToast({
        title: app.t('recipe_added'),
        icon: 'success'
      });
    } catch (err) {
      console.error('Add to list failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('recipe_add_failed'), icon: 'none' });
    }
  },

  async saveRecipe() {
    const auth = require('../../utils/auth.js');
    if (!auth.checkAndUpgrade()) return;

    if (!this.data.recipeName || this.data.recipeName === 'list_independent_ingredients' || this.data.recipeName === 'list_other_ingredients' || this.data.recipeName === 'list_direct_add') return;

    if (this.data.isSaved) {
      wx.showToast({ title: app.t('recipe_saved_already'), icon: 'none' });
      return;
    }

    wx.showLoading({ title: app.t('recipe_saving'), mask: true });

    try {
      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');

      // 如果有图片且是本地图片，先上传
      let cloudImagePath = this.data.cloudImagePath || '';
      if (this.data.imagePath && !this.data.imagePath.startsWith('cloud://') && !cloudImagePath) {
        try {
          const ext = this.data.imagePath.match(/\.([^.]+)$/)?.[1] || 'jpg';
          const cloudPath = `recipes/${userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}.${ext}`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: this.data.imagePath
          });
          cloudImagePath = uploadRes.fileID;
          this.setData({ cloudImagePath });
        } catch (uploadErr) {
          console.error('上传菜谱封面图失败:', uploadErr);
        }
      }

      // 检查是否已经收藏过
      const { data: existing } = await db.collection('recipes').where({
        _openid: userId,
        recipeName: this.data.recipeName
      }).get();

      if (existing && existing.length > 0) {
        wx.hideLoading();
        this.setData({ isSaved: true });
        wx.showToast({ title: app.t('recipe_saved_already'), icon: 'none' });
        return;
      }

      await db.collection('recipes').add({
        data: {
          recipeName: this.data.recipeName,
          ingredientName: this.data.ingredientName || this.data.recipeName,
          ingredientsNeeded: this.data.ingredients.map(ing => ing.name),
          sourceType: this.data.sourceType || 'familiar',
          cloudImagePath: cloudImagePath,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });

      wx.hideLoading();
      this.setData({ isSaved: true });
      wx.showToast({ title: app.t('recipe_saved_success'), icon: 'success' });
    } catch (err) {
      console.error('收藏食谱失败:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('recipe_save_failed'), icon: 'none' });
    }
  },

  // --- 视频做法检索功能 ---
  searchTutorial(e) {
    const platform = e.currentTarget.dataset.platform || 'bilibili';
    const recipeName = this.data.recipeName;
    if (!recipeName || recipeName === 'list_independent_ingredients' || recipeName === 'list_other_ingredients' || recipeName === 'list_direct_add') return;

    this.setData({
      showTutorialSheet: true,
      tutorialLoading: true,
      tutorialError: false,
      tutorialErrorMsg: '',
      tutorials: [],
      currentTutorialKeyword: recipeName,
      tutorialPlatform: platform
    });

    this.fetchTutorials(recipeName, platform);
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
        tutorialErrorMsg: this.data.i18n.err_cloud_func
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

    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: this.data.i18n.tutorial_copy_success,
          icon: 'none',
          duration: 3000
        });
      },
      fail: () => {
        wx.showToast({
          title: this.data.i18n.tutorial_copy_fail,
          icon: 'none'
        });
      }
    });
  }
});
