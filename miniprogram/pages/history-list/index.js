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
    currentTutorialKeyword: '',
    tutorialPlatform: 'bilibili'
  },

  async onLoad(options) {
    if (app.authReadyPromise) {
      await app.authReadyPromise;
    }

    if (!wx.getStorageSync('has_onboarded')) {
      const optionsArray = [];
      for (let key in options) {
        optionsArray.push(`${key}=${encodeURIComponent(options[key])}`);
      }
      const fullPath = `/pages/history-list/index${optionsArray.length > 0 ? '?' + optionsArray.join('&') : ''}`;
      
      wx.redirectTo({
        url: `/pages/onboarding/index?redirectUrl=${encodeURIComponent(fullPath)}`
      });
      return;
    }

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
        listStatus: this.data.isShared ? 'shared' : (list ? list.status : 'completed')
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
      const { makeDefaultListTitle } = require('../../utils/listTitle.js');
      const listTitle = makeDefaultListTitle(app.globalData.i18n);
      const activeListId = await dbUtil.ensureActiveList({ title: listTitle });
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
      const { makeDefaultListTitle } = require('../../utils/listTitle.js');
      const listTitle = makeDefaultListTitle(app.globalData.i18n);
      const activeListId = await dbUtil.ensureActiveList({ title: listTitle });
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

    if (this.data.savedRecipesMap && this.data.savedRecipesMap[title]) {
      wx.showToast({ title: app.t('recipe_saved_already'), icon: 'none' });
      return;
    }

    const recipeUtil = require('../../utils/recipeUtil.js');
    const res = await recipeUtil.saveRecipe({
      recipeName: title,
      ingredients: items,
      sourceType: 'familiar',
      ingredientName: title
    });

    if (res.success) {
      this.setData({
        [`savedRecipesMap.${title}`]: true
      });
      wx.showToast({ title: res.message, icon: 'success' });
    } else if (!res.handled) {
      wx.showToast({ title: res.message, icon: 'none' });
    }
  },

  // Allow user to tap a single ingredient to add it
  async addSingleIngredient(e) {
    if (this.data.listStatus === 'active') return;

    const item = e.currentTarget.dataset.item;
    if (!item) return;

    wx.showLoading({ title: app.t('recipe_adding') });
    try {
      const { makeDefaultListTitle } = require('../../utils/listTitle.js');
      const listTitle = makeDefaultListTitle(app.globalData.i18n);
      const activeListId = await dbUtil.ensureActiveList({ title: listTitle });
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
      currentTutorialKeyword: recipeName,
      tutorialPlatform: platform
    });
  },

  closeTutorialSheet() {
    this.setData({
      showTutorialSheet: false
    });
  },

  onShareAppMessage() {
    const i18n = this.data.i18n;
    const planningGroups = this.data.planningGroups || [];
    const validRecipes = planningGroups
      .map(g => g.title)
      .filter(title => title && title !== 'list_independent_ingredients' && title !== 'list_other_ingredients' && title !== 'list_direct_add');
    
    let shareTitle = i18n.list_share_title || '我的采购清单';
    if (validRecipes.length > 0) {
      const recipesText = validRecipes.slice(0, 2).join('、') + (validRecipes.length > 2 ? '等' : '');
      shareTitle = i18n.list_share_title ? i18n.list_share_title.replace('{recipe}', recipesText) : `今晚准备做【${recipesText}】，快来看看需要买什么！`;
    }
    
    return {
      title: shareTitle,
      path: `/pages/history-list/index?listId=${this.data.listId}&shared=1`
    };
  },

  onShareTimeline() {
    const i18n = this.data.i18n;
    const planningGroups = this.data.planningGroups || [];
    const validRecipes = planningGroups
      .map(g => g.title)
      .filter(title => title && title !== 'list_independent_ingredients' && title !== 'list_other_ingredients' && title !== 'list_direct_add');
    
    let shareTitle = i18n.list_share_title || '我的采购清单';
    if (validRecipes.length > 0) {
      const recipesText = validRecipes.slice(0, 2).join('、') + (validRecipes.length > 2 ? '等' : '');
      shareTitle = i18n.list_share_title ? i18n.list_share_title.replace('{recipe}', recipesText) : `今晚准备做【${recipesText}】，快来看看需要买什么！`;
    }
    
    return {
      title: shareTitle,
      query: ''
    };
  }
});
