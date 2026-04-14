/**
 * 识为鲜 PinFresh - 全局环境配置道岔
 * 
 * 【工作原理】
 * 1. 小程序启动时，会通过 wx.getAccountInfoSync() 自动获取当前运行版本
 * 2. 如果是 release(正式版)，自动连 Prod 正式库
 * 3. 如果是 develop(开发版) 或 trial(体验版)，自动连 Test 测试库
 */

// 🔑 物理越权钥匙（保底开关）
// 如果你害怕微信自动判断失效，或者想在本地强行连正式库，
// 把下面这行改成 'prod' 或 'test'，它就会无视微信，强行锁死环境。
// 默认设为 null，表示启用微信自动判断。
const FORCE_ENV = null; // 例如：const FORCE_ENV = 'prod';

const ENV_CONFIG = {
  // 生产环境（Prod）：真实用户数据，只允许正式版写入
  prod: 'cloud1-3g7709vbb44fe137',
  
  // 测试环境（Test）：日常开发、体验版测试用的环境
  test: 'cloud1test-6ghkzy71e35e0a65' 
};

const getActiveEnv = () => {
  // 1. 检查物理越权钥匙（最高优先级）
  if (FORCE_ENV) {
    console.warn(`[Env] ⚠️ 警告：当前环境被强制锁死为: ${FORCE_ENV}`);
    return ENV_CONFIG[FORCE_ENV];
  }

  // 2. 自动判断微信当前运行版本
  try {
    const accountInfo = wx.getAccountInfoSync();
    const envVersion = accountInfo.miniProgram.envVersion; 
    
    console.log(`[Env] 微信当前运行版本为: ${envVersion}`);

    if (envVersion === 'release') {
      return ENV_CONFIG.prod;
    } else {
      // 'develop' (开发版) 和 'trial' (体验版) 都连测试库
      return ENV_CONFIG.test;
    }
  } catch (err) {
    console.error('[Env] 获取运行环境失败，安全起见降级为 test 环境', err);
    // 找不到环境时，安全第一，宁可去test报错也不能污染prod
    return ENV_CONFIG.test; 
  }
};

module.exports = {
  ENV_CONFIG,
  getActiveEnv
};
