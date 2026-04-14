const app = getApp();
const dbUtil = require('../../utils/db.js');
const listUtil = require('../../utils/listUtil.js');

Page({
  data: {
    activeView: 'planning', // 'planning' | 'execution'
    planningGroups: [],
    executionGroups: [],
    listId: null,
    title: '采购清单',
    loading: true,
    i18n: {},
    lang: 'zh',
    
    // Tutorial Sheet State
    showTutorialSheet: false,
    tutorialLoading: false,
    tutorialError: false,
    tutorialErrorMsg: '',
    tutorials: [],
    tutorialPlatform: 'bilibili'
  },

  onLoad(options) {
    this.setData({ 
      i18n: app.globalData.i18n,
      lang: app.globalData.language,
      listId: options.listId || null,
      title: options.title ? decodeURIComponent(options.title) : '历史采购清单'
    });
    
    wx.setNavigationBarTitle({ title: this.data.title });
    
    if (this.data.listId) {
      this.loadList(this.data.listId);
    } else {
      this.setData({ loading: false });
    }
  },

  async loadList(listId) {
    this.setData({ loading: true });
    try {
      const list = await dbUtil.getListById(listId);
      
      const ingredients = list && list.items ? list.items.filter(item => item.status !== 'deleted') : [];
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
        loading: false,
        listStatus: list ? list.status : 'completed'
      });
    } catch (err) {
      console.error('Failed to load history list:', err);
      this.setData({ loading: false });
      wx.showToast({ title: app.t('err_load_failed'), icon: 'none' });
    }
  },

  toggleView() {
    this.setData({
      activeView: this.data.activeView === 'planning' ? 'execution' : 'planning'
    });
  },

  async addRecipeToNewList(e) {
    if (this.data.listStatus === 'active') return;
    
    const title = e.currentTarget.dataset.recipe;
    const items = e.currentTarget.dataset.items;
    if (!items || items.length === 0) return;

    wx.showLoading({ title: app.t('recipe_adding') });
    try {
      const activeListId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(activeListId, items);
      wx.hideLoading();
      wx.showToast({
        title: `已将"${title}"加入当前清单`,
        icon: 'none'
      });
    } catch (err) {
      console.error('Failed to add recipe to list:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('err_add_failed'), icon: 'none' });
    }
  },

  async addAllToNewList() {
    if (this.data.listStatus === 'active') return;

    const allItems = this._rawIngredients || [];
    if (allItems.length === 0) return;

    wx.showLoading({ title: app.t('recipe_adding') });
    try {
      const activeListId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(activeListId, allItems);
      wx.hideLoading();
      wx.showToast({
        title: app.t('list_all_added'),
        icon: 'none'
      });
    } catch (err) {
      console.error('Failed to add all to list:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('err_add_failed'), icon: 'none' });
    }
  },

  async saveRecipe(e) {
    const auth = require('../../utils/auth.js');
    if (!auth.checkAndUpgrade()) return;

    const title = e.currentTarget.dataset.recipe;
    const items = e.currentTarget.dataset.items;
    if (!title || !items) return;

    wx.showLoading({ title: app.t('recipe_saving'), mask: true });

    try {
      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');

      // 检查是否已经收藏过
      const { data: existing } = await db.collection('recipes').where({
        _openid: userId,
        recipeName: title
      }).get();

      if (existing && existing.length > 0) {
        wx.hideLoading();
        wx.showToast({ title: app.t('recipe_saved_already'), icon: 'none' });
        return;
      }

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

  // Allow user to tap a single ingredient to add it
  async addSingleIngredient(e) {
    if (this.data.listStatus === 'active') return;

    const item = e.currentTarget.dataset.item;
    if (!item) return;

    wx.showLoading({ title: app.t('recipe_adding') });
    try {
      const activeListId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(activeListId, [item]);
      wx.hideLoading();
      wx.showToast({
        title: `已添加"${item.name || item.standardName}"`,
        icon: 'none'
      });
    } catch (err) {
      console.error('Failed to add ingredient:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('err_add_failed'), icon: 'none' });
    }
  },

  // We can keep tutorial search functional if users want to watch tutorials for old recipes
  async searchTutorial(e) {
    const recipeName = e.currentTarget.dataset.recipe;
    const platform = e.currentTarget.dataset.platform || 'bilibili';
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
      console.error('[HistoryList] Search tutorial failed:', err);
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
      }
    });
  },

  closeTutorialSheet() {
    this.setData({ showTutorialSheet: false });
  }
});
