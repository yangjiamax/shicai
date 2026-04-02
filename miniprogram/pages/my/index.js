const app = getApp();

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    histories: [],
    currentPage: 1,
    pageSize: 5,
    totalPages: 0,
    totalHistories: 0,
    showLoginPrompt: true,
    isAnonymous: false,
    loadError: false,
    i18n: {},
    nationalityIndex: null
  },

  onLoad() {
    this.setData({ i18n: app.globalData.i18n });
  },

  onShow() {
    this.setData({ i18n: app.globalData.i18n });
    this.updateTabBarAndTitle();
    this.checkAuthSource();
    this.loadUserData();
    this.loadNationality();
  },

  loadNationality() {
    let saved = wx.getStorageSync('userNationality');
    if (saved !== '' && saved !== null && saved !== undefined) {
      // 兼容旧版基于索引的存储
      if (typeof saved === 'number' || (typeof saved === 'string' && /^\d+$/.test(saved))) {
        const oldKeys = ['cn', 'us', 'gb', 'fr', 'de', 'jp', 'kr', 'it', 'es', 'th', 'in', 'ru', 'other'];
        saved = oldKeys[parseInt(saved, 10)] || 'other';
        wx.setStorageSync('userNationality', saved);
      }

      const list = this.data.i18n.nationality_list || app.globalData.i18n.nationality_list;
      const index = list.findIndex(item => item.id === saved);
      if (index !== -1) {
        this.setData({ nationalityIndex: index });
      } else {
        this.setData({ nationalityIndex: null });
      }
    }
  },

  onNationalityChange(e) {
    const index = parseInt(e.detail.value, 10);
    this.setData({ nationalityIndex: index });
    const selectedItem = this.data.i18n.nationality_list[index];
    if (selectedItem) {
      wx.setStorageSync('userNationality', selectedItem.id);
    }
  },

  updateTabBarAndTitle() {
    wx.setNavigationBarTitle({ title: app.t('my_title') });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic if any
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_my') });
    }
  },

  switchLanguage() {
    const itemList = [
      app.t('lang_system') || '跟随系统',
      app.t('lang_zh') || '简体中文',
      app.t('lang_en') || 'English'
    ];
    const modes = ['system', 'zh', 'en'];
    
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const mode = modes[res.tapIndex];
        app.switchLanguage(mode);
        // 更新当前页面
        this.setData({ i18n: app.globalData.i18n });
        this.updateTabBarAndTitle();
      }
    });
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

  async loadHistories(page = 1) {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid' || !wx.cloud) {
      this.setData({ histories: [], loadError: false });
      return;
    }

    try {
      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      const pageSize = this.data.pageSize || 5;
      
      // 获取总数
      const countRes = await db.collection('histories').where({ _openid: userId }).count();
      const total = countRes.total;
      const totalPages = Math.ceil(total / pageSize);

      const skip = (page - 1) * pageSize;
      
      const { data } = await db.collection('histories')
        .where({ _openid: userId })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
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
        let initial = '';
        if (item.ingredient_name) {
          initial = item.ingredient_name.trim().charAt(0);
        }
        return {
          ...item,
          formattedDate: dateStr,
          initial
        };
      });

      this.setData({ 
        histories: formattedHistories, 
        currentPage: page,
        totalHistories: total,
        totalPages: totalPages,
        loadError: false 
      });
    } catch (err) {
      console.error('[My] Load histories failed:', err);
      this.setData({ histories: [], loadError: true });
    }
  },

  prevPage() {
    if (this.data.currentPage > 1) {
      this.loadHistories(this.data.currentPage - 1);
    }
  },

  nextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.loadHistories(this.data.currentPage + 1);
    }
  },

  async onChooseAvatar(e) {
    const tempAvatarUrl = e.detail.avatarUrl;
    
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid') {
      wx.showToast({ title: app.t('my_err_cloud_user'), icon: 'none' });
      this.setData({ 'userInfo.avatar': tempAvatarUrl });
      this.saveUserInfoLocal();
      return;
    }

    wx.showLoading({ title: app.t('my_uploading_avatar') });
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
      wx.showToast({ title: app.t('my_upload_avatar_success'), icon: 'success' });
    } catch (err) {
      console.error('[My] Upload avatar failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('my_upload_avatar_fail'), icon: 'none' });
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
      wx.showToast({ title: app.t('my_err_cloud_user'), icon: 'none' });
      this.saveUserInfoLocal();
      return;
    }

    wx.showLoading({ title: app.t('my_saving_nickname') });
    try {
      await this.saveUserInfoToCloud();
      this.saveUserInfoLocal();
      wx.hideLoading();
      wx.showToast({ title: app.t('my_save_nickname_success'), icon: 'success' });
    } catch (err) {
      console.error('[My] Save nickname failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('my_save_nickname_fail'), icon: 'none' });
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

  onDeleteHistory(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.histories[index];
    if (!history) return;

    wx.showModal({
      title: app.t('my_delete') || '删除',
      content: app.t('my_delete_confirm') || '确定删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: app.t('my_clearing') || '删除中...', mask: true });
          try {
            if (!wx.cloud) throw new Error('Cloud not initialized');
            const db = wx.cloud.database();
            
            await db.collection('histories').doc(history._id).remove();
            
            // Reload current page to update total count and pagination correctly
            this.loadHistories(this.data.currentPage);
            
            wx.hideLoading();
            wx.showToast({ title: app.t('my_delete_success') || '已删除', icon: 'success' });
          } catch (err) {
            console.error('[My] Delete history failed:', err);
            wx.hideLoading();
            wx.showToast({ title: app.t('my_delete_fail') || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  navigateToFeedback() {
    wx.navigateTo({
      url: '/pages/feedback/index'
    });
  },

  clearLocalData() {
    wx.showModal({
      title: app.t('my_clear_title'),
      content: app.t('my_clear_confirm'),
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: app.t('my_clearing'), mask: true });
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
            
            this.setData({ 
              histories: [],
              currentPage: 1,
              totalPages: 0,
              totalHistories: 0
            });
            wx.hideLoading();
            wx.showToast({ title: app.t('my_clear_success'), icon: 'success' });
          } catch (err) {
            console.error('[My] Clear histories failed:', err);
            wx.hideLoading();
            wx.showToast({ title: app.t('my_clear_fail'), icon: 'none' });
          }
        }
      }
    });
  }
});