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

  async onLoad() {
    console.log('index page loaded, userId:', app.globalData?.userId);
    
    // 等待 Auth 初始化完成（特别针对清除了缓存但其实是正式老用户的情况）
    if (app.authReadyPromise) {
      await app.authReadyPromise;
    }

    // 检查是否已经完成引导授权
    if (!wx.getStorageSync('has_onboarded')) {
      wx.reLaunch({
        url: '/pages/onboarding/index'
      });
      return;
    }

    this.setData({ 
      i18n: app.globalData.i18n,
      language: app.globalData.language
    });
  },

  async onShow() {
    if (app.authReadyPromise) {
      await app.authReadyPromise;
    }

    // 检查是否已经完成引导授权
    if (!wx.getStorageSync('has_onboarded')) {
      return;
    }

    this.setData({ 
      i18n: app.globalData.i18n,
      language: app.globalData.language
    });
    wx.setNavigationBarTitle({ title: app.t('app_name') });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // custom tabbar logic if any
    } else {
      wx.setTabBarItem({ index: 0, text: app.t('tab_home') });
      wx.setTabBarItem({ index: 1, text: app.t('tab_list') });
      wx.setTabBarItem({ index: 2, text: app.t('tab_my') });
    }
    await this.loadListProgress();
  },

  onHide() {
    if (this.loadingTimer) {
      clearInterval(this.loadingTimer);
    }
  },

  onUnload() {
    if (this.loadingTimer) {
      clearInterval(this.loadingTimer);
    }
  },

  async loadListProgress() {
    try {
      const listId = await dbUtil.getActiveList();
      const listData = await dbUtil.getListById(listId);
      
      const allIngredients = listData && listData.items ? listData.items.filter(item => item.status !== 'deleted') : [];
      
      const executionGroups = listUtil.deriveExecutionView(allIngredients);
      let totalCount = 0;
      let boughtCount = 0;
      
      executionGroups.forEach(group => {
        if (group.items && group.items.length > 0) {
          totalCount += group.items.length;
          boughtCount += group.items.filter(item => item.status === 'bought').length;
        }
      });
      
      let progressText = `${boughtCount} / ${totalCount} ` + (this.data.language === 'en' ? 'bought' : '项已购');
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
    
    // limit max swipe, now width is 260rpx, half is 130rpx, space is (602 - 260) / 2 = 171rpx = 85.5px
    // 增加一点冗余，限制在 85px 左右
    if (deltaX < -85) deltaX = -85;
    if (deltaX > 85) deltaX = 85;
    
    this.setData({ swipeX: deltaX });
  },

  onSwipeEnd(e) {
    if (this.data.isRecording) return;
    const deltaX = this.data.swipeX;
    const threshold = 60; // 降低阈值，确保在可用滑动空间内能触发
    
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
        title: app.t('index_swipe_hint'),
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
        title: app.t('index_input_empty'),
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
      },
      onRecognize: (text) => {
        // 可以实时展示识别结果，目前先忽略
      },
      onStop: async (res) => {
        this.setData({ isRecording: false });
        const text = res.result;
        console.log('语音识别最终结果:', text);
        
        if (!text || text.trim() === '') {
          wx.showToast({ title: app.t('index_voice_empty'), icon: 'none' });
          return;
        }
        
        // 直接调用处理文本的逻辑
        await this.processTextToList(text);
      },
      onError: (errMsg) => {
        this.setData({ isRecording: false });
        if (errMsg !== 'user_denied') {
          wx.showToast({ title: app.t('index_record_failed') + errMsg, icon: 'none' });
        }
      }
    });
    voiceUtil.startRecord();
  },

  async processTextToList(text) {
    this.setData({ isProcessing: true });
    
    // 动态 loading 文案逻辑
    const loadingTexts = this.data.language === 'en' ? [
      'Understanding your needs...',
      'Chef is breaking down the recipe...',
      'Picking fresh ingredients...',
      'Almost done, hold on...',
      'Generating shopping list...'
    ] : [
      '正在理解您的需求...',
      '大厨正在拆解菜谱...',
      '正在挑选新鲜食材...',
      '快好了，再等一下下...',
      '正在为您生成购物清单...'
    ];
    let textIndex = 0;
    
    this.setData({ dynamicLoadingText: loadingTexts[textIndex] });
    
    // 每 4 秒切换一次文案，缓解用户等待焦虑
    this.loadingTimer = setInterval(() => {
      textIndex = (textIndex + 1) % loadingTexts.length;
      this.setData({ dynamicLoadingText: loadingTexts[textIndex] });
    }, 4000);

    try {
      // 调用 extractList 云函数
      const res = await wx.cloud.callFunction({
        name: 'extractList',
        data: {
          text: text,
          lang: this.data.language || 'zh'
        }
      });

      if (this.loadingTimer) clearInterval(this.loadingTimer);
      const data = res.result;
      if (data && data.error) {
        throw new Error(data.message || (this.data.language === 'en' ? 'Failed to extract list' : '提取清单失败'));
      }

      const ingredients = data.data;
      console.log('提取清单结果:', ingredients);

      if (!ingredients || ingredients.length === 0) {
        wx.showToast({ title: app.t('index_voice_no_ingredient'), icon: 'none' });
        this.setData({ 
          isProcessing: false,
          showTextInput: true,
          textInputValue: text
        });
        return;
      }

      // 获取当前活跃清单并存入数据库
      const listId = await dbUtil.getActiveList();
      await dbUtil.addIngredientsToList(listId, ingredients);

      // 追加写入 histories 操作，携带 sourceType: 'text'
      const recipesMap = {};
      ingredients.forEach(ing => {
        const recipe = ing.sourceRecipe || ing.source_recipe;
        if (recipe && recipe !== 'list_independent_ingredients' && recipe !== 'list_other_ingredients' && recipe !== 'list_direct_add') {
          if (!recipesMap[recipe]) {
            recipesMap[recipe] = [];
          }
          recipesMap[recipe].push(ing.name);
        }
      });

      const db = wx.cloud.database();
      for (const recipeName in recipesMap) {
        try {
          await db.collection('histories').add({
            data: {
              sourceType: 'text',
              ingredientName: recipeName, // 修改点：将主食材名置为菜谱名，避免展示为空
              selectedRecipe: {
                recipeName: recipeName,
                ingredientsNeeded: recipesMap[recipeName]
              },
              analysisResult: null,
              cloudImagePath: '',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate()
            }
          });
        } catch (err) {
          console.error('保存纯文本集邮失败:', err);
        }
      }

      wx.hideLoading();
      this.setData({ isProcessing: false });
      
      wx.showToast({ 
        title: app.t('index_add_success'), 
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
      if (this.loadingTimer) clearInterval(this.loadingTimer);
      console.error('处理文本失败:', err);
      wx.hideLoading();
      this.setData({ 
        isProcessing: false,
        showTextInput: true,
        textInputValue: text
      });
      wx.showToast({ title: err.message || (this.data.language === 'en' ? 'Extraction failed, please retry' : '提取失败，请重试'), icon: 'none' });
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
      // 模糊定位和解析可能会比较慢，适当延长超时到 5 秒
      let isResolved = false;
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.warn('Get location timeout');
          resolve(null);
        }
      }, 5000);

      wx.getSetting({
        success: (settingRes) => {
          if (settingRes.authSetting['scope.userFuzzyLocation'] === false) {
            // 用户曾经拒绝过，引导开启
            wx.showModal({
              title: app.t('location_auth_title'),
              content: app.t('location_auth_content'),
              confirmText: app.t('go_to_setting'),
              success(modalRes) {
                if (modalRes.confirm) {
                  wx.openSetting();
                }
              }
            });
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              resolve(null);
            }
            return;
          }

          // 发起模糊定位
          wx.getFuzzyLocation({
            type: 'wgs84',
            success: (res) => {
              const latitude = res.latitude;
              const longitude = res.longitude;
              
              // 通过云函数调用逆地址解析，保护 Key 安全
              wx.cloud.callFunction({
                name: 'reverseGeocode',
                data: {
                  latitude: latitude,
                  longitude: longitude
                },
                success: (cloudRes) => {
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    
                    const result = cloudRes.result;
                    if (result && result.code === 0) {
                      resolve(result.data);
                    } else {
                      console.warn('云函数解析位置失败:', result);
                      resolve({ lat: latitude, lng: longitude });
                    }
                  }
                },
                fail: (err) => {
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    console.warn('调用逆地址解析云函数失败:', err);
                    resolve({ lat: latitude, lng: longitude });
                  }
                }
              });
            },
            fail: (err) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                console.warn('Get fuzzy location failed:', err);
                resolve(null);
              }
            }
          });
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

      // 直接跳转结果页，将 imagePath 和必要参数传过去，由结果页发起请求
      const extraParams = `&nationality=${encodeURIComponent(nationality || '')}&location=${encodeURIComponent(JSON.stringify(location || {}))}&imagePath=${encodeURIComponent(filePath)}`;
      wx.navigateTo({
        url: `/pages/result/index?action=analyze${extraParams}`
      });
    } catch (err) {
      console.error('analyze error:', err);
      let title = app.t('err_analyze_failed');
      
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
