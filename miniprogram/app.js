const zh = require('./utils/zh.js');
const en = require('./utils/en.js');

App({
  globalData: {
    userId: null,
    authSource: null,
    language: 'zh', // 默认语言
    i18n: {} // 当前语言字典
  },

  onLaunch() {
    console.log('[App] Launching...');
    
    // 1. 初始化语言
    this.initLanguage();

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // 填入你的云环境 ID
        env: 'cloud1-3g7709vbb44fe137',
        traceUser: true,
      });
    }

    console.log('[App] Initializing auth...');
    this.initAuth();
  },

  initLanguage() {
    // 优先读取用户手动设置的语言
    let lang = wx.getStorageSync('pf_lang');
    
    if (!lang) {
      // 如果没有设置，探测微信系统语言
      try {
        const sysInfo = wx.getSystemInfoSync();
        const sysLang = sysInfo.language || 'zh_CN';
        // 命中 zh_CN, zh_TW, zh_HK 设为 zh，其他一律设为 en
        if (sysLang.startsWith('zh')) {
          lang = 'zh';
        } else {
          lang = 'en';
        }
      } catch (e) {
        console.error('获取系统语言失败，降级为 zh', e);
        lang = 'zh';
      }
    }

    // 强行设为 en 测试 M14
    lang = 'en';

    this.setLanguage(lang);
    console.log('[App] Current language initialized as:', lang);
  },

  setLanguage(lang) {
    this.globalData.language = lang;
    this.globalData.i18n = lang === 'en' ? en : zh;
    wx.setStorageSync('pf_lang', lang);
  },

  switchLanguage(lang) {
    if (lang !== 'zh' && lang !== 'en') return;
    this.setLanguage(lang);
    console.log('[App] Language switched to:', lang);
    // 这里可以触发一个全局事件或者回调，让当前页面知道语言已切换
    // 在 M14 中会在页面 onLoad/onShow 中绑定 globalData.i18n
  },

  // 全局翻译函数
  t(key) {
    return this.globalData.i18n[key] || key;
  },

  async initAuth() {
    const auth = require('./utils/auth.js');
    const userId = await auth.initAuth();
    this.globalData.userId = userId;
    this.globalData.authSource = auth.getAuthSource();
    console.log('[App] Auth initialized, userId:', userId);
  }
});