const app = getApp();
const analyzeUtil = require('../../utils/analyze.js');

Page({
  data: {
    analyzing: false,
    result: null,
    i18n: {}
  },

  onLoad() {
    console.log('index page loaded, userId:', app.globalData?.userId);
    this.setData({ i18n: app.globalData.i18n });
  },

  onShow() {
    this.setData({ i18n: app.globalData.i18n });
    wx.setNavigationBarTitle({ title: app.t('app_name') });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic if any
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_my') });
    }
  },

  handleCamera() {
    if (!this.checkNationality()) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => {
        this.analyzeImage(res.tempFilePaths[0]);
      }
    });
  },

  handleAlbum() {
    if (!this.checkNationality()) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        this.analyzeImage(res.tempFilePaths[0]);
      }
    });
  },

  checkNationality() {
    const nationalityId = wx.getStorageSync('userNationality');
    if (!nationalityId) {
      wx.showModal({
        title: app.t('nationality_require_title'),
        content: app.t('nationality_require_content'),
        confirmText: app.t('nationality_require_confirm'),
        cancelText: app.t('nationality_require_cancel'),
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/my/index'
            });
          }
        }
      });
      return false;
    }
    return true;
  },

  getLocation() {
    return new Promise((resolve) => {
      // Set 3 seconds timeout
      let isResolved = false;
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.warn('Get location timeout');
          resolve(null);
        }
      }, 3000);

      wx.getLocation({
        type: 'wgs84',
        success(res) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            resolve({
              lat: res.latitude,
              lng: res.longitude
            });
          }
        },
        fail(err) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            console.warn('Get location failed:', err);
            resolve(null);
          }
        }
      });
    });
  },

  async analyzeImage(filePath) {
    this.setData({ analyzing: true });

    try {
      // Get location with timeout
      const location = await this.getLocation();
      const nationalityId = wx.getStorageSync('userNationality');
      const list = app.globalData.i18n.nationality_list || [];
      const nationalityObj = list.find(item => item.id === nationalityId);
      const nationality = nationalityObj ? nationalityObj.name : '';

      // 调用云函数，不再静默 fallback，确保能测试异常情况
      let result = await analyzeUtil.analyzeImage(filePath, { forceMock: false });

      if (result) {
        // 将 nationality 和 location 传递给结果页，用于后续分步请求
        const extraParams = `&nationality=${encodeURIComponent(nationality || '')}&location=${encodeURIComponent(JSON.stringify(location || {}))}`;
        wx.navigateTo({
          url: `/pages/result/index?data=${encodeURIComponent(JSON.stringify(result))}${extraParams}`
        });
      } else {
        throw new Error('empty_result');
      }
    } catch (err) {
      console.error('analyze error:', err);
      let title = app.t('err_analyze_failed');
      
      if (err.message === 'timeout') {
        title = app.t('err_timeout');
      } else if (err.message && err.message.startsWith('network_error:')) {
        title = app.t('err_network');
        // 弹出具体错误以便真机排查
        wx.showModal({
          title: app.t('err_cloud_func'),
          content: err.message,
          showCancel: false
        });
      } else if (err.message === 'network_error') {
        title = app.t('err_network');
      } else if (err.message === 'model_error') {
        title = app.t('err_model');
      } else if (err.message === 'file_read_error') {
        title = app.t('err_file_read');
      }
      
      wx.showToast({
        title,
        icon: 'none',
        duration: 2000
      });
    } finally {
      this.setData({ analyzing: false });
    }
  }
});