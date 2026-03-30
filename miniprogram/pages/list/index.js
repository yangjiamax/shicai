const app = getApp();

Page({
  data: {
    listData: null,
    shareTitle: '',
    isFavorite: false
  },

  onLoad(options) {
    if (options.data) {
      const data = JSON.parse(decodeURIComponent(options.data));
      this.setData({ 
        listData: data,
        shareTitle: `${data.ingredientName} - ${data.recipeName} 佐料`
      });
      this.checkFavoriteStatus(data);
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
      wx.showToast({ title: '请开启云服务以保存记录', icon: 'none' });
      return;
    }

    const db = wx.cloud.database();
    
    // 如果已收藏，则点击取消收藏（从 histories 删除）
    if (this.data.isFavorite && this.data.favoriteId) {
      wx.showLoading({ title: '取消中...' });
      try {
        await db.collection('histories').doc(this.data.favoriteId).remove();
        this.setData({ 
          isFavorite: false,
          favoriteId: null
        });
        wx.hideLoading();
        wx.showToast({ title: '已取消保存', icon: 'success' });
      } catch (err) {
        console.error('[List] Remove history failed:', err);
        wx.hideLoading();
        wx.showToast({ title: '取消失败，请重试', icon: 'none' });
      }
      return;
    }

    // 未收藏则添加至 histories
    wx.showLoading({ title: '保存中...' });
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
      
      wx.showToast({ title: '已保存至历史记录', icon: 'success' });
    } catch (err) {
      console.error('[List] Save history failed:', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  toggleIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const ingredients = this.data.listData.ingredients;
    ingredients[index].checked = !ingredients[index].checked;
    this.setData({ 'listData.ingredients': ingredients });
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
    
    return {
      title: `今晚准备做【${data.recipeName}】，快来看看需要买什么！`,
      desc: `需要：${checkedItems.join('、')}`,
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
      title: '清除历史记录',
      content: '确定清除所有历史记录吗？此操作不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中...', mask: true });
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
            wx.showToast({ title: '已清除', icon: 'success' });
          } catch (err) {
            console.error('[List] Clear histories failed:', err);
            wx.hideLoading();
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  }
});