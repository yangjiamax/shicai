App({
  globalData: {
    userId: null,
    authSource: null
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

    console.log('[App] Initializing auth...');
    this.initAuth();
  },

  async initAuth() {
    const auth = require('./utils/auth.js');
    const userId = await auth.initAuth();
    this.globalData.userId = userId;
    this.globalData.authSource = auth.getAuthSource();
    console.log('[App] Auth initialized, userId:', userId);
  }
});