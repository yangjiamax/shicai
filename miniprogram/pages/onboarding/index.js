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
      userInfo: initUserInfo
    });
    this.checkPermissions();
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
      // Save user info locally
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;

      const db = wx.cloud.database();
      const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');
      if (userId && userId !== 'anonymous') {
        try {
          const { data } = await db.collection('users').where({ _openid: userId }).get();
          if (data.length > 0) {
            await db.collection('users').doc(data[0]._id).update({
              data: {
                avatarUrl: userInfo.avatar,
                nickName: userInfo.nickname,
                nationality: wx.getStorageSync('userNationality') || '',
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
    
    if (this.data.isEditMode) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  }
});