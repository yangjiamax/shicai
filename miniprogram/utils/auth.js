const STORAGE_KEYS = {
  USER_ID: 'pf_user_id',
  AUTH_SOURCE: 'pf_auth_source',
  LAST_RECOGNITION: 'pf_last_recognition',
  LAST_IMAGE: 'pf_last_image',
  SELECTED_RECIPE: 'pf_selected_recipe'
};

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

let initAuthPromise = null;

async function initAuth() {
  if (initAuthPromise) {
    return initAuthPromise;
  }

  initAuthPromise = (async () => {
    const storedId = getStoredUserId();
    const authSource = getAuthSource();
    
    if (storedId && authSource === 'cloud_openid') {
      console.log('[Auth] Using stored formal userId:', storedId);
      return storedId; 
    }

    // 1. 尝试静默获取真实 OpenID，并检查是否为已注册老用户
    try {
      const res = await wx.cloud.callFunction({
        name: 'login'
      });

      if (res.result && res.result.success && res.result.openid) {
        const realOpenId = res.result.openid;
        console.log('[Auth] Silent login fetched openid:', realOpenId);
        wx.setStorageSync('pf_real_openid', realOpenId); // 保存真实 OpenID 供后续升级使用
        
        // 检查 users 表，判断是否为正式用户
        const db = wx.cloud.database();
        // 这里必须使用原始 collection，不能使用 getCollection 避免循环依赖和错误路由
        const userRes = await db.collection('users').where({ _openid: realOpenId }).get();
        
        console.log('[Auth] Users table query result:', userRes);
        
        if (userRes.data && userRes.data.length > 0) {
          const userData = userRes.data[0];
          setStoredUserId(realOpenId, 'cloud_openid');
          
          // 已经注册的正式用户，自动标记为已完成引导并恢复缓存，避免反复填表
          wx.setStorageSync('has_onboarded', true);
          wx.setStorageSync('userInfo', {
            avatar: userData.avatarUrl || '',
            nickname: userData.nickName || ''
          });
          if (userData.nationality) {
            wx.setStorageSync('userNationality', userData.nationality);
          }

          console.log('[Auth] Old formal user returned:', realOpenId);
          return realOpenId;
        } else {
          console.log('[Auth] New user detected (no record in users table), falling back to anonymous login');
        }
      }
    } catch (err) {
      console.warn('[Auth] Cloud login failed or not registered:', err);
    }

    // 2. 如果未注册，则使用微信官方匿名登录
    if (storedId && authSource === 'anonymous') {
      console.log('[Auth] Using existing anonymous id:', storedId);
      return storedId;
    }

    try {
      const { authResult } = await wx.cloud.signInAnonymously();
      const anonymousId = authResult.openid;
      setStoredUserId(anonymousId, 'anonymous');
      console.log('[Auth] Using new anonymous openid:', anonymousId);
      return anonymousId;
    } catch (err) {
      console.error('[Auth] Anonymous login failed:', err);
      throw err;
    }
  })();

  try {
    return await initAuthPromise;
  } finally {
    initAuthPromise = null;
  }
}

async function logout() {
  clearStoredUserId();
  wx.removeStorageSync('pf_real_openid');
  // 注意：不再使用 wx.clearStorageSync()，避免误删多语言配置、onboarding状态和本地业务缓存
  
  console.log('[Auth] Formal user identity cleared, re-initializing auth...');
  // 重新建立会话（此时因为没缓存，必定会走匿名登录）
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

function checkAndUpgrade() {
  const authSource = getAuthSource();
  if (authSource === 'anonymous') {
    const app = getApp();
    wx.showModal({
      title: app.t('auth_upgrade_title') || '体验模式',
      content: app.t('auth_upgrade_content') || '当前为游客体验模式，数据易丢失。请登录以永久保存您的数据。',
      confirmText: app.t('auth_upgrade_confirm') || '立即登录',
      cancelText: app.t('my_cancel') || '取消',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/onboarding/index?upgrade=1' });
        }
      }
    });
    return false;
  }
  return true;
}

module.exports = {
  initAuth,
  logout,
  getUserId,
  getAuthSource,
  checkAndUpgrade,
  STORAGE_KEYS
};