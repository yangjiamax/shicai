const MOCK_DATA = {
  ingredient_name: "本地Mock鲈鱼",
  ingredient_desc: "适合清蒸，注意去腥",
  freshness_level: "新鲜",
  freshness_reason: "鱼眼清澈微凸，鱼身有光泽",
  recipes: [
    {
      recipe_name: "清蒸鲈鱼",
      ingredients_needed: ["葱", "姜", "料酒", "蒸鱼豉油", "食用油"]
    },
    {
      recipe_name: "红烧鲈鱼",
      ingredients_needed: ["葱", "姜", "蒜", "生抽", "老抽", "糖", "料酒"]
    }
  ]
};

// 模式：'cloudfunction' | 'mock'
// 在 MVP 阶段，如果云环境未配置好，可以手动改成 'mock'
const MODE = 'cloudfunction'; 
const TIMEOUT_MS = 95000; // 95秒超时保护 (比云函数稍长一点)

function getMockResult() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_DATA);
    }, 1500); // 模拟网络延迟
  });
}

/**
 * 统一分析入口
 * @param {string} filePath 图片本地路径
 * @param {boolean} forceMock 强制使用本地 mock，即使出错也静默回退
 */
async function analyzeImage(filePath, forceMock = false) {
  if (MODE === 'mock' || forceMock) {
    console.log('[Analyze] Using local mock data');
    return await getMockResult();
  }

  // 获取 userId
  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    let isTimeout = false;
    
    const timer = setTimeout(() => {
      isTimeout = true;
      reject(new Error('timeout'));
    }, TIMEOUT_MS);

    // 首先读取文件转换为 base64
    const fileSystemManager = wx.getFileSystemManager();
    fileSystemManager.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: (fileRes) => {
        if (isTimeout) return;
        
        wx.cloud.callFunction({
          name: 'analyze',
          data: {
            action: 'analyze',
            imageBase64: fileRes.data,
            userId: userId,
            source: 'wx_miniprogram'
          },
          success: (res) => {
            if (isTimeout) return;
            clearTimeout(timer);
            
            if (res.result) {
              if (res.result.error) {
                // 如果云函数显式返回了错误
                reject(new Error(res.result.errorType || 'model_error'));
                return;
              }
              
              // 结构兜底补齐
              const data = res.result;
              const result = {
                ingredient_name: data.ingredient_name || '未知食材',
                ingredient_desc: data.ingredient_desc || '暂无描述',
                freshness_level: data.freshness_level || '未知',
                freshness_reason: data.freshness_reason || '未能识别鲜度原因',
                recipes: Array.isArray(data.recipes) && data.recipes.length > 0 ? data.recipes.map(r => ({
                  recipe_name: r.recipe_name || '未知做法',
                  ingredients_needed: Array.isArray(r.ingredients_needed) ? r.ingredients_needed : ['未知佐料']
                })) : []
              };
              resolve(result);
            } else {
              reject(new Error('bad_response'));
            }
          },
          fail: (err) => {
            if (isTimeout) return;
            clearTimeout(timer);
            console.error('[Analyze] Cloud function failed:', err);
            // 区分网络错误和其他错误
            if (err.errMsg && (err.errMsg.includes('request:fail') || err.errMsg.includes('timeout'))) {
              reject(new Error('network_error'));
            } else {
              reject(new Error('network_error')); // 默认当做网络或云调用失败
            }
          }
        });
      },
      fail: (err) => {
        if (isTimeout) return;
        clearTimeout(timer);
        console.error('[Analyze] Read file failed:', err);
        reject(new Error('file_read_error'));
      }
    });
  });
}

module.exports = {
  analyzeImage,
  MOCK_DATA
};