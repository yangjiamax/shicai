const app = getApp();
const dbUtil = require('../../utils/db.js');

Page({
  data: {
    recipeName: '',
    ingredients: [],
    loading: true,
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
          ingredients: data.ingredients || []
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
    wx.setNavigationBarTitle({ title: this.data.recipeName || '菜谱详情' });
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
      const res = await db.collection(dbUtil.COLLECTIONS.INGREDIENTS).aggregate()
        .match({
          source_recipe: this.data.recipeName,
          status: _.neq('deleted')
        })
        .group({
          _id: '$name',
          docId: $.last('$_id'),
          status: $.last('$status'),
          add_time: $.max('$add_time')
        })
        .sort({ add_time: -1 })
        .end();

      const dbIngredients = (res.list || []).map(item => ({
        _id: item.docId,
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

      this.setData({ ingredients: mergedIngredients, loading: false });
    } catch (err) {
      console.error('Failed to load recipe details:', err);
      this.setData({ loading: false });
    }
  },

  async addAllToNewList() {
    if (!this.data.ingredients || this.data.ingredients.length === 0) {
      wx.showToast({ title: '无食材可添加', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '添加中...' });
    try {
      const activeListId = await dbUtil.getActiveList();
      const itemsToAdd = this.data.ingredients.map(ing => ({
        name: ing.name,
        standard_name: ing.name,
        category: 'other',
        source_recipe: this.data.recipeName
      }));
      
      await dbUtil.addIngredientsToList(activeListId, itemsToAdd);
      wx.hideLoading();
      wx.showToast({
        title: '已加入当前清单',
        icon: 'success'
      });
    } catch (err) {
      console.error('Add to list failed:', err);
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  // --- 视频做法检索功能 ---
  searchTutorial(e) {
    const platform = e.currentTarget.dataset.platform || 'bilibili';
    const recipeName = this.data.recipeName;
    if (!recipeName) return;

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
        tutorialErrorMsg: this.data.i18n.err_cloud_func || '加载失败，请重试'
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
          title: this.data.i18n.tutorial_copy_success || '链接已复制，请在浏览器中打开',
          icon: 'none',
          duration: 3000
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  }
});
