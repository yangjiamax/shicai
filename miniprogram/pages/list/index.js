const app = getApp();

Page({
  data: {
    listData: null,
    shareTitle: '',
    isFavorite: false,
    i18n: {},
    
    // Tutorial Sheet State
    showTutorialSheet: false,
    tutorialLoading: false,
    tutorialError: false,
    tutorialErrorMsg: '',
    tutorials: [],
    currentTutorialKeyword: ''
  },

  onLoad(options) {
    this.setData({ i18n: app.globalData.i18n });
    if (options.data) {
      const data = JSON.parse(decodeURIComponent(options.data));
      this.setData({ 
        listData: data,
        shareTitle: app.t('list_share_title').replace('{recipe}', data.recipeName)
      });
      this.checkFavoriteStatus(data);
    }
  },

  onShow() {
    this.setData({ i18n: app.globalData.i18n });
    wx.setNavigationBarTitle({ title: app.t('list_title') });
    if (this.data.listData) {
      this.setData({
        shareTitle: app.t('list_share_title').replace('{recipe}', this.data.listData.recipeName)
      });
    }
  },

  async checkFavoriteStatus(data) {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid' || !wx.cloud) return;

    try {
      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      
      const res = await db.collection('histories').where({
        _openid: userId,
        ingredient_name: data.ingredientName,
        'selected_recipe.recipe_name': data.recipeName
      }).get();

      if (res.data && res.data.length > 0) {
        this.setData({ isFavorite: true, favoriteId: res.data[0]._id });
      }
    } catch (err) {
      console.error('[List] Check history status failed:', err);
    }
  },

  async saveFavorite() {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid' || !wx.cloud) {
      wx.showToast({ title: app.t('err_cloud_save'), icon: 'none' });
      return;
    }

    const db = wx.cloud.database();
    
    // 如果已收藏，则点击取消收藏（从 histories 删除）
    if (this.data.isFavorite && this.data.favoriteId) {
      wx.showLoading({ title: app.t('list_canceling') });
      try {
        await db.collection('histories').doc(this.data.favoriteId).remove();
        this.setData({ 
          isFavorite: false,
          favoriteId: null
        });
        wx.hideLoading();
        wx.showToast({ title: app.t('list_cancel_success'), icon: 'success' });
      } catch (err) {
        console.error('[List] Remove history failed:', err);
        wx.hideLoading();
        wx.showToast({ title: app.t('list_cancel_fail'), icon: 'none' });
      }
      return;
    }

    // 未收藏则添加至 histories
    wx.showLoading({ title: app.t('list_saving') });
    try {
      const data = this.data.listData;
      const res = await db.collection('histories').add({
        data: {
          analysisResult: data.analysisResult,
          ingredient_name: data.ingredientName,
          selected_recipe: {
            recipe_name: data.recipeName,
            ingredients_needed: data.ingredients.map(i => i.name),
            checked_ingredients: data.ingredients.filter(i => i.checked).map(i => i.name)
          },
          createdAt: db.serverDate()
        }
      });

      this.setData({ 
        isFavorite: true,
        favoriteId: res._id
      });
      wx.hideLoading();
      
      wx.showToast({ title: app.t('list_save_success'), icon: 'success' });
    } catch (err) {
      console.error('[List] Save history failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('list_save_fail'), icon: 'none' });
    }
  },

  toggleIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const ingredients = this.data.listData.ingredients;
    ingredients[index].checked = !ingredients[index].checked;
    this.setData({ 'listData.ingredients': ingredients });
  },

  editIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const ingredients = this.data.listData.ingredients;
    ingredients[index].name = value;
    this.setData({ 'listData.ingredients': ingredients });
  },

  blurIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value.trim();
    const ingredients = this.data.listData.ingredients;
    
    if (!value) {
      // If emptied, maybe we don't delete automatically to avoid accidental deletion,
      // but let's delete it if it's completely empty.
      this.deleteIngredient(e);
    } else {
      ingredients[index].name = value;
      this.setData({ 'listData.ingredients': ingredients });
    }
  },

  deleteIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const ingredients = this.data.listData.ingredients;
    ingredients.splice(index, 1);
    this.setData({ 'listData.ingredients': ingredients });
  },

  onNewItemInput(e) {
    this.setData({ newItemName: e.detail.value });
  },

  addNewItem() {
    const name = (this.data.newItemName || '').trim();
    if (!name) return;
    
    const ingredients = this.data.listData.ingredients;
    ingredients.push({ name: name, checked: false });
    this.setData({ 
      'listData.ingredients': ingredients,
      newItemName: ''
    });
  },

  onShareAppMessage() {
    const data = this.data.listData;
    const checkedItems = data.ingredients.filter(i => i.checked).map(i => i.name);
    
    // 把当前列表数据（包含完整分析结果）通过分享链接传递
    const shareData = encodeURIComponent(JSON.stringify(data));
    
    // 使用云存储图片作为分享封面图
    const imageUrl = (data.analysisResult && data.analysisResult.cloudImagePath) 
                      ? data.analysisResult.cloudImagePath 
                      : ((data.analysisResult && data.analysisResult.imagePath) ? data.analysisResult.imagePath : undefined);
    
    const separator = app.globalData.language === 'en' ? ', ' : '、';
    return {
      title: app.t('list_share_title').replace('{recipe}', data.recipeName),
      desc: app.t('list_share_desc') + checkedItems.join(separator),
      path: `/pages/result/index?shared=1&data=${shareData}`,
      imageUrl: imageUrl
    };
  },

  retry() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  },

  clearData() {
    wx.showModal({
      title: app.t('list_clear_title'),
      content: app.t('list_clear_confirm'),
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: app.t('list_clearing'), mask: true });
          try {
            if (!wx.cloud) throw new Error('Cloud not initialized');
            const db = wx.cloud.database();
            const app = getApp();
            const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
            
            let hasMore = true;
            while (hasMore) {
              const { data } = await db.collection('histories').where({ _openid: userId }).limit(20).get();
              if (data.length === 0) {
                hasMore = false;
                break;
              }
              const deletePromises = data.map(item => db.collection('histories').doc(item._id).remove());
              await Promise.all(deletePromises);
            }
            
            if (this.data.isFavorite) {
              this.setData({ isFavorite: false, favoriteId: null });
            }
            wx.hideLoading();
            wx.showToast({ title: app.t('list_clear_success'), icon: 'success' });
          } catch (err) {
            console.error('[List] Clear histories failed:', err);
            wx.hideLoading();
            wx.showToast({ title: app.t('list_clear_fail'), icon: 'none' });
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
        // Cloud function returns both now, but let's select based on user tap
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

  copyTutorialLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;

    wx.setClipboardData({
      data: url,
      success: () => {
        wx.hideToast(); // Hide the default "内容已复制" toast
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