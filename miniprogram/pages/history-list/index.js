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
      console.error('Failed to load history list:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  toggleView() {
    this.setData({
      activeView: this.data.activeView === 'planning' ? 'execution' : 'planning'
    });
  },

  async addRecipeToNewList(e) {
    const title = e.currentTarget.dataset.recipe;
    const items = e.currentTarget.dataset.items;
    if (!items || items.length === 0) return;

    wx.showLoading({ title: '添加中...' });
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
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  async addAllToNewList() {
    const allItems = this._rawIngredients || [];
    if (allItems.length === 0) return;

    wx.showLoading({ title: '添加中...' });
    try {
      const activeListId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(activeListId, allItems);
      wx.hideLoading();
      wx.showToast({
        title: '全部食材已加入当前清单',
        icon: 'none'
      });
    } catch (err) {
      console.error('Failed to add all to list:', err);
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  // Allow user to tap a single ingredient to add it
  async addSingleIngredient(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    wx.showLoading({ title: '添加中...' });
    try {
      const activeListId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(activeListId, [item]);
      wx.hideLoading();
      wx.showToast({
        title: `已添加"${item.name || item.standard_name}"`,
        icon: 'none'
      });
    } catch (err) {
      console.error('Failed to add ingredient:', err);
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  // We can keep tutorial search functional if users want to watch tutorials for old recipes
  async searchTutorial(e) {
    const recipeName = e.currentTarget.dataset.recipe;
    const platform = e.currentTarget.dataset.platform || 'bilibili';
    if (!recipeName || recipeName === '其他' || recipeName === '直接添加') return;

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
        tutorialErrorMsg: this.data.i18n.tutorial_error || '加载教程失败，请重试'
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
          title: this.data.i18n.tutorial_link_copied || '链接已复制，请在浏览器中打开',
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
