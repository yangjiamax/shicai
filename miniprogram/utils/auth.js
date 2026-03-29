const STORAGE_KEYS = {
  USER_ID: 'pf_user_id',
  AUTH_SOURCE: 'pf_auth_source',
  LAST_RECOGNITION: 'pf_last_recognition',
  LAST_IMAGE: 'pf_last_image',
  SELECTED_RECIPE: 'pf_selected_recipe'
};

function generateAnonymousId() {
  return 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getStoredUserId() {
  return wx.getStorageSync(STORAGE_KEYS.USER_ID);
}

function setStoredUserId(userId, source) {
  wx.setStorageSync(STORAGE_KEYS.USER_ID, userId);
  wx.setStorageSync(STORAGE_KEYS.AUTH_SOURCE, source);
}

function clearStoredUserId() {
  wx.removeStorageSync(STORAGE_KEYS.USER_ID);
  wx.removeStorageSync(STORAGE_KEYS.AUTH_SOURCE);
}

async function initAuth() {
  const storedId = getStoredUserId();
  if (storedId) {
    console.log('[Auth] Using stored userId:', storedId);
    return storedId;
  }

  try {
    const res = await wx.cloud.callFunction({
      name: 'login'
    });

    if (res.result && res.result.success && res.result.openid) {
      const userId = res.result.openid;
      setStoredUserId(userId, 'cloud_openid');
      console.log('[Auth] Got cloud openid:', userId);
      return userId;
    }
  } catch (err) {
    console.warn('[Auth] Cloud login failed, trying anonymous:', err);
  }

  const anonymousId = generateAnonymousId();
  setStoredUserId(anonymousId, 'anonymous');
  console.log('[Auth] Using anonymous id:', anonymousId);
  return anonymousId;
}

async function logout() {
  // 清空所有本地数据（包含 pf_user_id, pf_auth_source 和业务缓存）
  wx.clearStorageSync();
  
  console.log('[Auth] Storage cleared, re-initializing auth...');
  // 重新建立会话
  const newUserId = await initAuth();
  
  // 更新全局状态
  const app = getApp();
  if (app) {
    app.globalData.userId = newUserId;
    app.globalData.authSource = getAuthSource();
  }
  
  // 返回首页
  wx.reLaunch({ url: '/pages/index/index' });
}

function getUserId() {
  return getStoredUserId();
}

function getAuthSource() {
  return wx.getStorageSync(STORAGE_KEYS.AUTH_SOURCE);
}

module.exports = {
  initAuth,
  logout,
  getUserId,
  getAuthSource,
  STORAGE_KEYS
};