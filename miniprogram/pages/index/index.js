const app = getApp();
const analyzeUtil = require('../../utils/analyze.js');
const dbUtil = require('../../utils/db.js');
const listUtil = require('../../utils/listUtil.js');

Page({
  data: {
    analyzing: false,
    isProcessing: false,
    isRecording: false,
    result: null,
    i18n: {},
    totalCount: 0,
    boughtCount: 0,
    progressText: '',
    swipeX: 0,
    swipeTransition: '',
    startX: 0,
    showTextInput: false,
    textInputValue: ''
  },

  onLoad() {
    console.log('index page loaded, userId:', app.globalData?.userId);
    this.setData({ i18n: app.globalData.i18n });
  },

  async onShow() {
    this.setData({ i18n: app.globalData.i18n });
    wx.setNavigationBarTitle({ title: app.t('app_name') });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic if any
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_list') || '清单' });
      wx.setTabBarItem({ index: 2, text: app.t('tab_my') });
    }
    await this.loadListProgress();
  },

  async loadListProgress() {
    try {
      const listId = await dbUtil.getActiveList();
      
      const countRes = await dbUtil.db.collection(dbUtil.COLLECTIONS.INGREDIENTS)
        .where({
          list_id: listId,
          status: dbUtil.db.command.neq('deleted')
        }).count();
      const total = countRes.total;
      
      let allIngredients = [];
      const MAX_LIMIT = 20;
      
      for (let i = 0; i < total; i += MAX_LIMIT) {
        const res = await dbUtil.db.collection(dbUtil.COLLECTIONS.INGREDIENTS)
          .where({
            list_id: listId,
            status: dbUtil.db.command.neq('deleted')
          })
          .orderBy('add_time', 'desc')
          .skip(i)
          .limit(MAX_LIMIT)
          .get();
        allIngredients = allIngredients.concat(res.data || []);
      }
      
      const executionGroups = listUtil.deriveExecutionView(allIngredients);
      let totalCount = 0;
      let boughtCount = 0;
      
      executionGroups.forEach(group => {
        if (group.items && group.items.length > 0) {
          totalCount += group.items.length;
          boughtCount += group.items.filter(item => item.status === 'bought').length;
        }
      });
      
      let progressText = `${boughtCount} / ${totalCount} 项已购`;
      if (this.data.i18n && this.data.i18n.list_progress_desc) {
        progressText = this.data.i18n.list_progress_desc.replace('{bought}', boughtCount).replace('{total}', totalCount);
      }

      this.setData({ totalCount, boughtCount, progressText });
    } catch (error) {
      console.error('Failed to load list progress:', error);
    }
  },

  goToList() {
    wx.switchTab({
      url: '/pages/list/index'
    });
  },

  handleVoiceRecord() {
    if (this.data.isRecording) {
      const voiceUtil = require('../../utils/voice.js');
      voiceUtil.stopRecord();
      return;
    }
    this.startVoiceRecord();
  },

  onSwipeStart(e) {
    if (this.data.isRecording) return;
    this.setData({
      startX: e.touches[0].clientX,
      swipeTransition: 'none'
    });
  },

  onSwipeMove(e) {
    if (this.data.isRecording) return;
    const currentX = e.touches[0].clientX;
    let deltaX = currentX - this.data.startX;
    
    // limit max swipe
    if (deltaX < -120) deltaX = -120;
    if (deltaX > 120) deltaX = 120;
    
    this.setData({ swipeX: deltaX });
  },

  onSwipeEnd(e) {
    if (this.data.isRecording) return;
    const deltaX = this.data.swipeX;
    const threshold = 80;
    
    this.setData({
      swipeX: 0,
      swipeTransition: 'transform 0.3s ease'
    });

    if (deltaX < -threshold) {
      this.startTextInput();
    } else if (deltaX > threshold) {
      this.handleVoiceRecord();
    }
  },

  onSwipeTap() {
    if (this.data.isRecording) {
      this.handleVoiceRecord();
    } else {
      wx.showToast({
        title: '请向左或向右滑动',
        icon: 'none'
      });
    }
  },

  startTextInput() {
    this.setData({
      showTextInput: true,
      textInputValue: ''
    });
  },

  closeTextInput() {
    this.setData({
      showTextInput: false
    });
  },

  preventTap() {
    // 阻止事件冒泡
  },

  onTextInput(e) {
    this.setData({
      textInputValue: e.detail.value
    });
  },

  async confirmTextInput() {
    const text = this.data.textInputValue;
    if (!text || text.trim() === '') {
      wx.showToast({
        title: '请输入食材内容',
        icon: 'none'
      });
      return;
    }
    this.closeTextInput();
    await this.processTextToList(text);
  },

  startVoiceRecord() {
    const voiceUtil = require('../../utils/voice.js');
    voiceUtil.initRecordManager({
      onStart: () => {
        this.setData({ isRecording: true });
        wx.showToast({ title: '录音中，再次点击停止', icon: 'none', duration: 60000 });
      },
      onRecognize: (text) => {
        // 可以实时展示识别结果，目前先忽略
      },
      onStop: async (res) => {
        wx.hideToast();
        this.setData({ isRecording: false });
        const text = res.result;
        console.log('语音识别最终结果:', text);
        
        if (!text || text.trim() === '') {
          wx.showToast({ title: '未能识别到语音内容', icon: 'none' });
          return;
        }
        
        // 直接调用处理文本的逻辑
        await this.processTextToList(text);
      },
      onError: (errMsg) => {
        this.setData({ isRecording: false });
        if (errMsg !== 'user_denied') {
          wx.showToast({ title: '录音失败: ' + errMsg, icon: 'none' });
        }
      }
    });
    voiceUtil.startRecord();
  },

  async processTextToList(text) {
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '正在提取清单...', mask: true });
    try {
      // 调用 extractList 云函数
      const res = await wx.cloud.callFunction({
        name: 'extractList',
        data: {
          text: text,
          lang: wx.getStorageSync('language') || 'zh'
        }
      });

      const data = res.result;
      if (data && data.error) {
        throw new Error(data.message || '提取清单失败');
      }

      const ingredients = data.data;
      console.log('提取清单结果:', ingredients);

      if (!ingredients || ingredients.length === 0) {
        wx.showToast({ title: '未能识别到食材', icon: 'none' });
        this.setData({ isProcessing: false });
        return;
      }

      // 获取当前活跃清单并存入数据库
      const listId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(listId, ingredients);

      wx.hideLoading();
      this.setData({ isProcessing: false });
      
      wx.showToast({ 
        title: '添加成功', 
        icon: 'success',
        duration: 2000
      });
      
      // 更新首页进度
      await this.loadListProgress();

      // 延迟跳转到清单页，让用户看到“添加成功”的提示
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/list/index'
        });
      }, 1500);

    } catch (err) {
      console.error('处理文本失败:', err);
      wx.hideLoading();
      this.setData({ isProcessing: false });
      wx.showToast({ title: err.message || '提取失败，请重试', icon: 'none' });
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