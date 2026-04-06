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

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // 填入你的云环境 ID
        env: 'cloud1-3g7709vbb44fe137',
        traceUser: true,
      });
    }
    
    // 1. 初始化语言
    this.initLanguage();

    console.log('[App] Initializing auth...');
    this.initAuth();
  },

  initLanguage() {
    // 优先读取用户手动设置的语言
    let lang = wx.getStorageSync('pf_lang');
    
    if (!lang || lang === 'system') {
      // 如果没有设置或者设为跟随系统，探测微信系统语言
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

    this.setLanguage(lang);
    console.log('[App] Current language initialized as:', lang);
  },

  setLanguage(lang) {
    this.globalData.language = lang;
    this.globalData.i18n = lang === 'en' ? en : zh;
    // 不在这里设置 Storage，保持 pf_lang 原样（可能是 system 或为空）

    // 尝试同步到云端 users 表
    this.syncUserPreferences({ language: lang });
  },

  switchLanguage(mode) {
    // mode 可以是 'zh', 'en', 'system'
    if (mode === 'system') {
      wx.removeStorageSync('pf_lang');
    } else if (mode === 'zh' || mode === 'en') {
      wx.setStorageSync('pf_lang', mode);
    } else {
      return;
    }
    this.initLanguage();
    console.log('[App] Language switched, new pf_lang mode:', mode);
  },

  // 全局翻译函数
  t(key) {
    return this.globalData.i18n[key] || key;
  },

  initAuth() {
    const auth = require('./utils/auth.js');
    this.authReadyPromise = (async () => {
      const userId = await auth.initAuth();
      this.globalData.userId = userId;
      this.globalData.authSource = auth.getAuthSource();
      console.log('[App] Auth initialized, userId:', userId);

      // 登录成功后，也尝试同步一次
      this.syncUserPreferences({ language: this.globalData.language });
      return userId;
    })();
    return this.authReadyPromise;
  },

  async syncUserPreferences(preferences) {
    if (!wx.cloud) return;
    const userId = this.globalData.userId || wx.getStorageSync('pf_user_id');
    const authSource = this.globalData.authSource || wx.getStorageSync('pf_auth_source');
    
    if (!userId || authSource !== 'cloud_openid') return;

    try {
      const db = wx.cloud.database();
      await db.collection('users').where({ _openid: userId }).update({
        data: preferences
      });
    } catch (err) {
      console.error('[App] Failed to sync user preferences:', err);
    }
  }
});