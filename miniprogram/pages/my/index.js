const app = getApp();

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    histories: [],
    showLoginPrompt: true,
    isAnonymous: false,
    loadError: false
  },

  onShow() {
    this.checkAuthSource();
    this.loadUserData();
  },

  checkAuthSource() {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    this.setData({
      isAnonymous: authSource !== 'cloud_openid'
    });
  },

  async loadUserData() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && (userInfo.avatar || userInfo.nickname)) {
      this.setData({
        userInfo,
        hasUserInfo: true,
        showLoginPrompt: false
      });
      this.loadHistories();
    } else {
      // 尝试从云端拉取
      const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
      if (authSource === 'cloud_openid') {
        try {
          const db = wx.cloud.database();
          const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
          const { data } = await db.collection('users').where({ _openid: userId }).get();
          if (data && data.length > 0) {
            const cloudUserInfo = {
              avatar: data[0].avatarUrl,
              nickname: data[0].nickName
            };
            this.setData({
              userInfo: cloudUserInfo,
              hasUserInfo: true,
              showLoginPrompt: false
            });
            wx.setStorageSync('userInfo', cloudUserInfo);
          } else {
            this.setData({ hasUserInfo: false, showLoginPrompt: true });
          }
        } catch (err) {
          console.error('[My] Fetch user info from cloud failed:', err);
          this.setData({ hasUserInfo: false, showLoginPrompt: true });
        }
      } else {
        this.setData({ hasUserInfo: false, showLoginPrompt: true });
      }
      this.loadHistories();
    }
  },

  async loadHistories() {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid' || !wx.cloud) {
      this.setData({ histories: [], loadError: false });
      return;
    }

    try {
      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      
      const { data } = await db.collection('histories')
        .where({ _openid: userId })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const formattedHistories = data.map(item => {
        let dateStr = '';
        if (item.createdAt) {
          const d = new Date(item.createdAt);
          const month = (d.getMonth() + 1).toString().padStart(2, '0');
          const day = d.getDate().toString().padStart(2, '0');
          const hours = d.getHours().toString().padStart(2, '0');
          const minutes = d.getMinutes().toString().padStart(2, '0');
          dateStr = `${month}-${day} ${hours}:${minutes}`;
        }
        return {
          ...item,
          formattedDate: dateStr
        };
      });

      this.setData({ histories: formattedHistories, loadError: false });
    } catch (err) {
      console.error('[My] Load histories failed:', err);
      this.setData({ histories: [], loadError: true });
    }
  },

  async onChooseAvatar(e) {
    const tempAvatarUrl = e.detail.avatarUrl;
    
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid') {
      wx.showToast({ title: '请开启云服务以保存个人信息', icon: 'none' });
      this.setData({ 'userInfo.avatar': tempAvatarUrl });
      this.saveUserInfoLocal();
      return;
    }

    wx.showLoading({ title: '上传头像中...' });
    try {
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      const ext = tempAvatarUrl.match(/\.([^.]+)$/)?.[1] || 'png';
      const cloudPath = `avatars/${userId}-${Date.now()}.${ext}`;
      
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempAvatarUrl
      });
      
      this.setData({ 'userInfo.avatar': uploadRes.fileID });
      await this.saveUserInfoToCloud();
      this.saveUserInfoLocal();
      
      wx.hideLoading();
      wx.showToast({ title: '头像上传成功', icon: 'success' });
    } catch (err) {
      console.error('[My] Upload avatar failed:', err);
      wx.hideLoading();
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
      // 降级使用本地临时路径
      this.setData({ 'userInfo.avatar': tempAvatarUrl });
      this.saveUserInfoLocal();
    }
  },

  onNicknameInput(e) {
    this.setData({ 'userInfo.nickname': e.detail.value });
  },

  async saveNickname() {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid') {
      wx.showToast({ title: '请开启云服务以保存个人信息', icon: 'none' });
      this.saveUserInfoLocal();
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      await this.saveUserInfoToCloud();
      this.saveUserInfoLocal();
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('[My] Save nickname failed:', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      this.saveUserInfoLocal();
    }
  },

  saveUserInfoLocal() {
    wx.setStorageSync('userInfo', this.data.userInfo);
    this.setData({ hasUserInfo: true, showLoginPrompt: false });
  },

  async saveUserInfoToCloud() {
    const db = wx.cloud.database();
    const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
    const userInfo = this.data.userInfo || {};
    
    try {
      const { data } = await db.collection('users').where({ _openid: userId }).get();
      if (data && data.length > 0) {
        // 更新
        await db.collection('users').doc(data[0]._id).update({
          data: {
            avatarUrl: userInfo.avatar || '',
            nickName: userInfo.nickname || '',
            updatedAt: db.serverDate()
          }
        });
      } else {
        // 新增
        await db.collection('users').add({
          data: {
            avatarUrl: userInfo.avatar || '',
            nickName: userInfo.nickname || '',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
      }
    } catch (err) {
      console.error('[My] Cloud DB operation failed:', err);
      throw err;
    }
  },

  navigateToHistory(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.histories[index];
    
    if (!history || !history.selected_recipe) return;

    // 如果包含完整的分析结果上下文，则走“动线复用”，先进入结果页
    if (history.analysisResult) {
      const listData = {
        ingredientName: history.ingredient_name,
        recipeName: history.selected_recipe.recipe_name,
        ingredients: (history.selected_recipe.ingredients_needed || []).map(name => ({
          name: name,
          checked: history.selected_recipe.checked_ingredients ? history.selected_recipe.checked_ingredients.includes(name) : false
        })),
        analysisResult: history.analysisResult
      };
      
      wx.navigateTo({
        url: `/pages/result/index?fromHistory=1&data=${encodeURIComponent(JSON.stringify(listData))}`
      });
      return;
    }

    // 兼容旧的没有 analysisResult 的历史记录，直接跳转到清单页
    const listData = {
      ingredientName: history.ingredient_name,
      recipeName: history.selected_recipe.recipe_name,
      ingredients: (history.selected_recipe.ingredients_needed || []).map(name => ({
        name: name,
        checked: false
      }))
    };

    wx.navigateTo({
      url: `/pages/list/index?data=${encodeURIComponent(JSON.stringify(listData))}`
    });
  },

  clearLocalData() {
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
            
            this.setData({ histories: [] });
            wx.hideLoading();
            wx.showToast({ title: '已清除', icon: 'success' });
          } catch (err) {
            console.error('[My] Clear histories failed:', err);
            wx.hideLoading();
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  }
});