const app = getApp();

Page({
  data: {
    analyzing: false,
    result: null
  },

  onLoad() {
    console.log('index page loaded, userId:', app.globalData?.userId);
  },

  handleCamera() {
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
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        this.analyzeImage(res.tempFilePaths[0]);
      }
    });
  },

  async analyzeImage(filePath) {
    this.setData({ analyzing: true });

    const analyzeUtil = require('../../utils/analyze.js');

    try {
      // 调用云函数，不再静默 fallback，确保能测试异常情况
      let result = await analyzeUtil.analyzeImage(filePath);

      if (result) {
        wx.navigateTo({
          url: `/pages/result/index?data=${encodeURIComponent(JSON.stringify(result))}`
        });
      } else {
        throw new Error('empty_result');
      }
    } catch (err) {
      console.error('analyze error:', err);
      let title = '识别失败，请重试';
      
      if (err.message === 'timeout') {
        title = '请求超时，请重试';
      } else if (err.message === 'network_error') {
        title = '网络错误，请重试';
      } else if (err.message === 'model_error') {
        title = '模型服务异常，请重试';
      } else if (err.message === 'file_read_error') {
        title = '读取图片失败，请重试';
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