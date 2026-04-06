const app = getApp();

Page({
  data: {
    i18n: {},
    userInfo: {
      avatar: '',
      nickname: ''
    },
    nationality: '',
    locationAuthed: false,
    recordAuthed: false,
    navHeight: 0,
    statusBarHeight: 0,
    isEditMode: false,
    showPicker: false,
    tempNationalityIndex: 0
  },

  onLoad(options) {
    const sysInfo = wx.getSystemInfoSync();
    
    // Check if we are entering from 'My' page
    const isEditMode = options.mode === 'edit';
    const isUpgradeMode = options.upgrade === '1';

    // Load existing user info if any
    const savedUserInfo = wx.getStorageSync('userInfo');
    const initUserInfo = {
      avatar: savedUserInfo?.avatar || '',
      nickname: savedUserInfo?.nickname || ''
    };

    this.setData({
      i18n: app.globalData.i18n,
      navHeight: sysInfo.statusBarHeight + 44,
      statusBarHeight: sysInfo.statusBarHeight,
      isEditMode,
      isUpgradeMode,
      userInfo: initUserInfo
    });
    
    // 如果是编辑模式且本地没有信息，尝试从云端加载
    if (isEditMode && (!initUserInfo.avatar || !initUserInfo.nickname)) {
      this.loadCloudUserInfo();
    }

    this.checkPermissions();
  },

  async loadCloudUserInfo() {
    const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');
    if (authSource === 'cloud_openid') {
      try {
        const db = wx.cloud.database();
        const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
        const { data } = await db.collection('users').where({ _openid: userId }).get();
        if (data && data.length > 0) {
          const cloudUserInfo = {
            avatar: data[0].avatarUrl || '',
            nickname: data[0].nickName || ''
          };
          this.setData({ userInfo: cloudUserInfo });
          wx.setStorageSync('userInfo', cloudUserInfo);
          
          if (data[0].nationality) {
            wx.setStorageSync('userNationality', data[0].nationality);
            const natIndex = this.data.i18n.nationality_list?.findIndex(n => n.id === data[0].nationality);
            if (natIndex !== undefined && natIndex !== -1) {
              this.setData({ tempNationalityIndex: natIndex });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load cloud user info in onboarding:', err);
      }
    }
  },

  async checkPermissions() {
    // Check location and record permissions
    wx.getSetting({
      success: (res) => {
        this.setData({
          locationAuthed: !!res.authSetting['scope.userFuzzyLocation'],
          recordAuthed: !!res.authSetting['scope.record']
        });
      }
    });

    // Check nationality
    const nationalityId = wx.getStorageSync('userNationality');
    if (nationalityId) {
      const list = this.data.i18n.nationality_list || [];
      const nationalityObj = list.find(item => item.id === nationalityId);
      if (nationalityObj) {
        this.setData({ nationality: nationalityObj.name });
      }
    }
  },

  onAvatarError() {
    this.setData({
      'userInfo.avatar': ''
    });
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      'userInfo.avatar': avatarUrl
    });
  },

  onNicknameInput(e) {
    const { value } = e.detail;
    this.setData({
      'userInfo.nickname': value
    });
  },

  showNationalityPicker() {
    const list = this.data.i18n.nationality_list || [];
    const currentId = wx.getStorageSync('userNationality');
    let currentIndex = 0;
    if (currentId) {
      currentIndex = list.findIndex(item => item.id === currentId);
      if (currentIndex === -1) currentIndex = 0;
    }
    
    this.setData({
      showPicker: true,
      tempNationalityIndex: currentIndex
    });
  },

  hideNationalityPicker() {
    this.setData({ showPicker: false });
  },

  onNationalityPickerChange(e) {
    this.setData({ tempNationalityIndex: e.detail.value[0] });
  },

  confirmNationality() {
    const list = this.data.i18n.nationality_list || [];
    const index = this.data.tempNationalityIndex;
    const selected = list[index];
    if (selected) {
      this.setData({ 
        nationality: selected.name,
        showPicker: false 
      });
      wx.setStorageSync('userNationality', selected.id);
    } else {
      this.hideNationalityPicker();
    }
  },

  onBack() {
    wx.navigateBack();
  },

  async requestLocation() {
    if (this.data.locationAuthed) {
      wx.openSetting({
        success: (res) => {
          this.setData({
            locationAuthed: !!res.authSetting['scope.userFuzzyLocation'],
            recordAuthed: !!res.authSetting['scope.record']
          });
        }
      });
      return;
    }
    
    try {
      await new Promise((resolve, reject) => {
        wx.authorize({
          scope: 'scope.userFuzzyLocation',
          success: resolve,
          fail: reject
        });
      });
      this.setData({ locationAuthed: true });
    } catch (e) {
      wx.showModal({
        title: app.t('onboarding_auth_hint'),
        content: app.t('onboarding_auth_location_desc'),
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                this.setData({
                  locationAuthed: !!settingRes.authSetting['scope.userFuzzyLocation'],
                  recordAuthed: !!settingRes.authSetting['scope.record']
                });
              }
            });
          }
        }
      });
    }
  },

  async requestRecord() {
    if (this.data.recordAuthed) {
      wx.openSetting({
        success: (res) => {
          this.setData({
            locationAuthed: !!res.authSetting['scope.userFuzzyLocation'],
            recordAuthed: !!res.authSetting['scope.record']
          });
        }
      });
      return;
    }
    
    try {
      await new Promise((resolve, reject) => {
        wx.authorize({
          scope: 'scope.record',
          success: resolve,
          fail: reject
        });
      });
      this.setData({ recordAuthed: true });
    } catch (e) {
      wx.showModal({
        title: app.t('onboarding_auth_hint'),
        content: app.t('onboarding_auth_record_desc'),
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                this.setData({
                  locationAuthed: !!settingRes.authSetting['scope.userFuzzyLocation'],
                  recordAuthed: !!settingRes.authSetting['scope.record']
                });
              }
            });
          }
        }
      });
    }
  },

  async onEnter() {
    const { userInfo, nationality } = this.data;
    
    if (userInfo.avatar && userInfo.nickname) {
      // 检查头像是否为本地临时路径，如果是，则上传到云存储持久化
      if (userInfo.avatar.startsWith('http://tmp') || userInfo.avatar.startsWith('wxfile://')) {
        wx.showLoading({ title: app.t('loading') || '处理中...', mask: true });
        try {
          const uploadUserId = wx.getStorageSync('pf_real_openid') || app.globalData.userId || wx.getStorageSync('pf_user_id') || 'temp';
          const ext = userInfo.avatar.match(/\.([^.]+)$/)?.[1] || 'png';
          const cloudPath = `avatars/${uploadUserId}-${Date.now()}.${ext}`;
          
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: userInfo.avatar
          });
          userInfo.avatar = uploadRes.fileID;
          this.setData({ 'userInfo.avatar': userInfo.avatar });
        } catch (err) {
          console.error('Avatar upload failed in onboarding:', err);
          wx.hideLoading();
          wx.showToast({ title: app.t('my_upload_avatar_fail') || '头像上传失败', icon: 'none' });
          this.setData({ 'userInfo.avatar': '' }); // Clear invalid avatar
          return;
        }
      }

      // Save user info locally
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;

      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      const authSource = app.globalData.authSource || wx.getStorageSync('pf_auth_source');

      if (this.data.isUpgradeMode && authSource === 'anonymous') {
        wx.showLoading({ title: app.t('loading') || '升级中...', mask: true });
        try {
          const realOpenId = wx.getStorageSync('pf_real_openid');
          if (!realOpenId) throw new Error('Missing real openid');
          
          // 调用云函数执行数据迁移和正式用户创建
          const res = await wx.cloud.callFunction({
            name: 'migrateUserData',
            data: {
              anonymousOpenId: userId,
              realOpenId: realOpenId,
              userInfo: {
                avatarUrl: userInfo.avatar,
                nickName: userInfo.nickname,
                nationality: wx.getStorageSync('userNationality') || '',
                language: app.globalData.language || wx.getStorageSync('pf_lang') || 'zh'
              }
            }
          });
          
          if (res.result && res.result.success) {
            // 更新本地身份
            wx.setStorageSync('pf_user_id', realOpenId);
            wx.setStorageSync('pf_auth_source', 'cloud_openid');
            app.globalData.userId = realOpenId;
            app.globalData.authSource = 'cloud_openid';
            wx.showToast({ title: app.t('success') || '升级成功', icon: 'success' });
          } else {
            throw new Error(res.result?.error || 'Migration failed');
          }
        } catch (e) {
          console.error('Upgrade failed', e);
          wx.hideLoading();
          wx.showToast({ title: app.t('err_network') || '网络错误，请重试', icon: 'none' });
          return;
        }
      } else if (userId && authSource === 'cloud_openid') {
        try {
          const { data } = await db.collection('users').where({ _openid: userId }).get();
          if (data.length > 0) {
            await db.collection('users').doc(data[0]._id).update({
              data: {
                avatarUrl: userInfo.avatar,
                nickName: userInfo.nickname,
                nationality: wx.getStorageSync('userNationality') || '',
                language: app.globalData.language || wx.getStorageSync('pf_lang') || 'zh',
                updatedAt: db.serverDate()
              }
            });
          }
        } catch (e) {
          console.error('Update user info error', e);
        }
      }
    }

    wx.setStorageSync('has_onboarded', true);
    
    if (this.data.isEditMode || this.data.isUpgradeMode) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  }
});