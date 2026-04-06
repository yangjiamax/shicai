const app = getApp();

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    historyTab: 'collection', // 'collection' | 'planning' | 'execution'
    histories: [],
    currentPage: 1,
    pageSize: 5,
    totalPages: 0,
    totalHistories: 0,
    showLoginPrompt: true,
    isAnonymous: false,
    loadError: false,
    i18n: {},
    nationalityIndex: null,
    isEditing: false,
    isAllSelected: false,
    showPicker: false,
    tempNationalityIndex: 0
  },

  goToOnboarding() {
    wx.navigateTo({
      url: '/pages/onboarding/index?mode=edit'
    });
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

  showNationalityPicker() {
    this.setData({
      showPicker: true,
      tempNationalityIndex: this.data.nationalityIndex || 0
    });
  },

  hideNationalityPicker() {
    this.setData({ showPicker: false });
  },

  onNationalityPickerChange(e) {
    this.setData({ tempNationalityIndex: e.detail.value[0] });
  },

  confirmNationality() {
    const index = this.data.tempNationalityIndex;
    this.setData({ 
      nationalityIndex: index,
      showPicker: false 
    });
    const selectedItem = this.data.i18n.nationality_list[index];
    if (selectedItem) {
      wx.setStorageSync('userNationality', selectedItem.id);
      
      // 同步到云端
      if (app.syncUserPreferences) {
        app.syncUserPreferences({ nationality: selectedItem.id });
      }
    }
  },

  updateTabBarAndTitle() {
    wx.setNavigationBarTitle({ title: app.t('my_title') });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic if any
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_list') });
      wx.setTabBarItem({ index: 2, text: app.t('tab_my') });
    }
  },

  switchLanguage() {
    const itemList = [
      app.t('lang_system'),
      app.t('lang_zh'),
      app.t('lang_en')
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

  async retryAuth() {
    if (!this.data.isAnonymous) return;
    wx.showLoading({ title: app.t('loading'), mask: true });
    try {
      const auth = require('../../utils/auth.js');
      const newUserId = await auth.initAuth();
      app.globalData.userId = newUserId;
      app.globalData.authSource = auth.getAuthSource();
      
      this.checkAuthSource();
      if (!this.data.isAnonymous) {
        wx.showToast({ title: app.t('success'), icon: 'success' });
        this.loadUserData();
      } else {
        wx.showToast({ title: app.t('my_network_error'), icon: 'none' });
      }
    } catch (err) {
      console.error('Retry auth failed:', err);
      wx.showToast({ title: app.t('my_network_error'), icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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
            
            // Sync preferences from cloud
            if (data[0].nationality) {
              wx.setStorageSync('userNationality', data[0].nationality);
              const natIndex = this.data.i18n.nationality_list.findIndex(n => n.id === data[0].nationality);
              if (natIndex !== -1) {
                this.setData({ nationalityIndex: natIndex });
              }
            }
            if (data[0].language) {
              app.switchLanguage(data[0].language);
            }
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

  switchHistoryTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.historyTab === tab) return;
    
    this.setData({ 
      historyTab: tab,
      histories: [],
      currentPage: 1,
      totalPages: 0,
      totalHistories: 0
    });
    
    this.loadHistories();
  },

  async loadHistories(page = 1) {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource !== 'cloud_openid' || !wx.cloud) {
      this.setData({ histories: [], loadError: false });
      return;
    }

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const $ = db.command.aggregate;
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      const pageSize = this.data.pageSize || 5;
      const skip = (page - 1) * pageSize;
      const tab = this.data.historyTab;
      
      let total = 0;
      let totalPages = 0;
      let formattedHistories = [];

      if (tab === 'execution') {
        // 账单: 汇总选购里的单次汇总 (shopping_lists)
        const countRes = await db.collection('shopping_lists').where({ _openid: userId }).count();
        total = countRes.total;
        totalPages = Math.ceil(total / pageSize);
        
        const { data } = await db.collection('shopping_lists')
          .where({ _openid: userId })
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();
          
        formattedHistories = data.map(item => {
          let dateStr = this.formatDate(item.createdAt);
          let title = item.title || app.t('my_shopping_list');

          // 不再显示右下角日期，可以从 selectedRecipe 处移除或者在 wxml 控制，为了安全起见我们保留 dateStr 仅隐藏 wxml

          return {
            _id: item._id,
            ingredientName: title,
            selectedRecipe: { recipeName: app.t('my_full_purchase') },
            formattedDate: dateStr,
            initial: app.t('my_initial_bill'),
            type: 'bill',
            status: item.status
          };
        });
      } else if (tab === 'planning') {
        // 菜谱: 收藏的宝藏食谱 (recipes)
        const countRes = await db.collection('recipes').where({ _openid: userId }).count();
          
        total = countRes.total;
        totalPages = Math.ceil(total / pageSize);
        
        const { data } = await db.collection('recipes')
          .where({ _openid: userId })
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();
          
        formattedHistories = data.map(item => {
          let dateStr = this.formatDate(item.createdAt);
          return {
            _id: item._id,
            ingredientName: item.recipeName,
            selectedRecipe: { recipeName: app.t('my_ingredients_count').replace('{count}', (item.ingredientsNeeded || []).length) },
            formattedDate: this.formatDate(item.createdAt),
            initial: item.recipeName ? item.recipeName.charAt(0) : app.t('my_initial_recipe'),
            ingredientsList: item.ingredientsNeeded || [],
            type: 'recipe'
          };
        });
      } else {
        // 集邮: 拍照保存过的主食材清单 (histories)
        // 仅查询 sourceType 为 'vision' 的记录
        // 过滤巨大字段 analysisResult
        const countRes = await db.collection('histories').aggregate()
          .match({ _openid: userId, sourceType: 'vision' })
          .group({ _id: '$ingredientName' })
          .count('total')
          .end();
          
        total = (countRes.list && countRes.list.length > 0) ? countRes.list[0].total : 0;
        totalPages = Math.ceil(total / pageSize);
        
        const res = await db.collection('histories').aggregate()
          .match({ _openid: userId, sourceType: 'vision' })
          .project({ analysisResult: false })
          .sort({ createdAt: -1 })
          .group({
            _id: '$ingredientName',
            originalId: $.first('$_id'),
            createdAt: $.first('$createdAt'),
            ingredientName: $.first('$ingredientName'),
            selectedRecipe: $.first('$selectedRecipe'),
            cloudImagePath: $.first('$cloudImagePath')
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .end();
          
        formattedHistories = res.list.map(item => {
          let dateStr = this.formatDate(item.createdAt);
          let initial = '';
          if (item.ingredientName) {
            initial = item.ingredientName.trim().charAt(0);
          }
          return {
            _id: item.originalId,
            ingredientName: item.ingredientName,
            selectedRecipe: item.selectedRecipe,
            cloudImagePath: item.cloudImagePath,
            createdAt: item.createdAt,
            formattedDate: dateStr,
            initial,
            type: 'stamp'
          };
        });
      }

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

  formatDate(timestampOrDate) {
    if (!timestampOrDate) return '';
    const d = new Date(timestampOrDate);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
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

  async navigateToHistory(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.histories[index];
    
    if (!history) return;

    if (history.type === 'bill') {
      wx.navigateTo({
        url: `/pages/history-list/index?listId=${history._id}&title=${encodeURIComponent(history.ingredientName)}`
      });
      return;
    }
    
    if (history.type === 'recipe') {
      const recipeData = {
        recipeName: history.ingredientName,
        ingredients: history.ingredientsList.map(name => ({
          name: name,
          checked: false
        }))
      };
      wx.navigateTo({
        url: `/pages/recipe/index?data=${encodeURIComponent(JSON.stringify(recipeData))}`
      });
      return;
    }

    // type === 'stamp'
    if (!history.selectedRecipe) return;

    // 单条拉取完整数据以获取 analysisResult
    wx.showLoading({ title: app.t('loading'), mask: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('histories').doc(history._id).get();
      const fullHistory = res.data;
      
      wx.hideLoading();

      if (fullHistory.analysisResult) {
        const listData = {
          ingredientName: fullHistory.ingredientName,
          recipeName: fullHistory.selectedRecipe.recipeName,
          ingredients: (fullHistory.selectedRecipe.ingredientsNeeded || []).map(name => ({
            name: name,
            checked: fullHistory.selectedRecipe.checkedIngredients ? fullHistory.selectedRecipe.checkedIngredients.includes(name) : false
          })),
          analysisResult: fullHistory.analysisResult
        };
        
        wx.navigateTo({
          url: `/pages/result/index?fromHistory=1&data=${encodeURIComponent(JSON.stringify(listData))}`
        });
        return;
      }

      // 兼容旧的没有 analysisResult 的历史记录，直接跳转到菜谱详情页
      const listData = {
        ingredientName: fullHistory.ingredientName,
        recipeName: fullHistory.selectedRecipe.recipeName,
        ingredients: (fullHistory.selectedRecipe.ingredientsNeeded || []).map(name => ({
          name: name,
          checked: false
        }))
      };

      wx.navigateTo({
        url: `/pages/recipe/index?data=${encodeURIComponent(JSON.stringify(listData))}`
      });
    } catch (err) {
      console.error('Fetch full history failed:', err);
      wx.hideLoading();
      wx.showToast({ title: app.t('err_load_failed'), icon: 'none' });
    }
  },

  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    if (index !== undefined) {
      const key = `histories[${index}].cloudImagePath`;
      this.setData({
        [key]: ''
      });
    }
  },

  onDeleteHistory(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.histories[index];
    if (!history) return;

    wx.showModal({
      title: app.t('my_delete'),
      content: app.t('my_delete_confirm'),
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: app.t('my_clearing'), mask: true });
          try {
            if (!wx.cloud) throw new Error('Cloud not initialized');
            const db = wx.cloud.database();
            const _ = db.command;
            const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
            
            if (history.type === 'bill') {
              await db.collection('shopping_lists').doc(history._id).remove();
            } else if (history.type === 'recipe') {
              await db.collection('recipes').doc(history._id).remove();
            } else {
              // stamp: delete all histories with the same ingredientName
              const { data } = await db.collection('histories').where({ _openid: userId, ingredientName: history.ingredientName }).get();
              if (data && data.length > 0) {
                const promises = data.map(item => db.collection('histories').doc(item._id).remove());
                await Promise.all(promises);
              }
            }
            
            // Reload current page to update total count and pagination correctly
            this.loadHistories(this.data.currentPage);
            
            wx.hideLoading();
            wx.showToast({ title: app.t('my_delete_success'), icon: 'success' });
          } catch (err) {
            console.error('[My] Delete history failed:', err);
            wx.hideLoading();
            wx.showToast({ title: app.t('my_delete_fail'), icon: 'none' });
          }
        }
      }
    });
  },

  toggleEditMode() {
    const isEditing = !this.data.isEditing;
    const histories = this.data.histories.map(h => ({ ...h, selected: false }));
    this.setData({ 
      isEditing, 
      histories,
      isAllSelected: false 
    });
  },

  toggleSelectItem(e) {
    const index = e.currentTarget.dataset.index;
    const histories = this.data.histories;
    histories[index].selected = !histories[index].selected;
    const isAllSelected = histories.every(h => h.selected);
    this.setData({ histories, isAllSelected });
  },

  toggleSelectAll() {
    const isAllSelected = !this.data.isAllSelected;
    const histories = this.data.histories.map(h => ({ ...h, selected: isAllSelected }));
    this.setData({ histories, isAllSelected });
  },

  deleteSelected() {
    const selectedHistories = this.data.histories.filter(h => h.selected);
    if (selectedHistories.length === 0) {
      wx.showToast({ title: app.t('my_no_selection'), icon: 'none' });
      return;
    }

    wx.showModal({
      title: app.t('my_batch_delete'),
      content: app.t('my_batch_delete_confirm').replace('{count}', selectedHistories.length),
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: app.t('my_deleting'), mask: true });
          try {
            const db = wx.cloud.database();
            const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
            const promises = [];
            
            for (const history of selectedHistories) {
              if (history.type === 'bill') {
                promises.push(db.collection('shopping_lists').doc(history._id).remove());
              } else if (history.type === 'recipe') {
                promises.push(db.collection('recipes').doc(history._id).remove());
              } else {
                const { data } = await db.collection('histories').where({ _openid: userId, ingredientName: history.ingredientName }).get();
                if (data && data.length > 0) {
                  data.forEach(item => {
                    promises.push(db.collection('histories').doc(item._id).remove());
                  });
                }
              }
            }
            
            await Promise.all(promises);
            this.setData({ isEditing: false, isAllSelected: false });
            this.loadHistories(this.data.currentPage);
            wx.hideLoading();
            wx.showToast({ title: app.t('my_deleted'), icon: 'success' });
          } catch (err) {
            console.error('[My] Batch delete failed:', err);
            wx.hideLoading();
            wx.showToast({ title: app.t('my_delete_failed'), icon: 'none' });
          }
        }
      }
    });
  },

  triggerRename(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.histories[index];
    if (!history) return;
    
    // 目前重命名主要是改 bill 的名称或集邮的食材名称
    if (history.type === 'recipe') {
       wx.showToast({ title: app.t('my_rename_unsupported'), icon: 'none' });
       return;
    }

    // Since wx.showModal in older versions doesn't support text input directly, we could use a custom component or `wx.showModal` with editable (base library >= 2.30.0)
    if (wx.canIUse('showModal.object.editable')) {
      wx.showModal({
        title: app.t('my_rename_title'),
        editable: true,
        placeholderText: app.t('my_rename_placeholder'),
        content: history.ingredientName,
        success: async (res) => {
          if (res.confirm && res.content && res.content.trim() !== '') {
            const newName = res.content.trim();
            wx.showLoading({ title: app.t('list_saving') });
            try {
              const db = wx.cloud.database();
              if (history.type === 'bill') {
                await db.collection('shopping_lists').doc(history._id).update({
                  data: { title: newName }
                });
              } else if (history.type === 'stamp') {
                const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
                const { data } = await db.collection('histories').where({ _openid: userId, ingredientName: history.ingredientName }).get();
                if (data && data.length > 0) {
                  const promises = data.map(item => db.collection('histories').doc(item._id).update({
                    data: { ingredientName: newName }
                  }));
                  await Promise.all(promises);
                }
              }
              this.loadHistories(this.data.currentPage);
              wx.hideLoading();
              wx.showToast({ title: app.t('my_modify_success'), icon: 'success' });
            } catch (err) {
              console.error('Rename failed:', err);
              wx.hideLoading();
              wx.showToast({ title: app.t('my_modify_failed'), icon: 'none' });
            }
          }
        }
      });
    } else {
      wx.showToast({ title: app.t('my_wx_version_low'), icon: 'none' });
    }
  },

  navigateToFeedback() {
    wx.navigateTo({
      url: '/pages/feedback/index'
    });
  }
});