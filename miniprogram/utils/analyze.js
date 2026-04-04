const MOCK_DATA_ZH = {
  ingredient_name: "本地Mock鲈鱼",
  ingredient_desc: "适合清蒸，注意去腥",
  taste: "鲜甜",
  texture: "肉质细嫩，蒜瓣肉",
  similar: "黑鱼",
  freshness_level: "新鲜",
  freshness_reason: "鱼眼清澈微凸，鱼身有光泽",
  recipes: {
    familiar: [
      {
        recipe_name: "家常清蒸鲈鱼",
        ingredients_needed: ["葱", "姜", "料酒", "蒸鱼豉油", "食用油"]
      }
    ],
    local: [
      {
        recipe_name: "当地红烧鲈鱼",
        ingredients_needed: ["葱", "姜", "蒜", "生抽", "老抽", "糖", "料酒"]
      }
    ]
  }
};

const MOCK_DATA_EN = {
  ingredient_name: "Local Mock Sea Bass",
  ingredient_desc: "Suitable for steaming, remember to remove fishy smell",
  taste: "Fresh and sweet",
  texture: "Tender meat, flaky texture",
  similar: "Snakehead",
  freshness_level: "Fresh",
  freshness_reason: "Clear and slightly protruding eyes, shiny skin",
  recipes: {
    familiar: [
      {
        recipe_name: "Home-style Steamed Sea Bass",
        ingredients_needed: ["Scallion", "Ginger", "Cooking wine", "Steamed fish soy sauce", "Cooking oil"]
      }
    ],
    local: [
      {
        recipe_name: "Local Braised Sea Bass",
        ingredients_needed: ["Scallion", "Ginger", "Garlic", "Light soy sauce", "Dark soy sauce", "Sugar", "Cooking wine"]
      }
    ]
  }
};

// 模式：'cloudfunction' | 'mock'
// 在 MVP 阶段，如果云环境未配置好，可以手动改成 'mock'
const MODE = 'cloudfunction'; 
const TIMEOUT_MS = 95000; // 95秒超时保护
const TEXT_TIMEOUT_MS = 30000; // 文本生成超时时间

function getMockResult(lang) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(lang === 'en' ? MOCK_DATA_EN : MOCK_DATA_ZH);
    }, 1500); // 模拟网络延迟
  });
}

/**
 * Step 1: 视觉分析（仅识别食材名称、鲜度等基本信息）
 */
async function analyzeImage(filePath, options = {}) {
  const forceMock = typeof options === 'boolean' ? options : !!options.forceMock;

  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    console.log('[Analyze] Using local mock data, lang:', lang);
    const mockResult = await getMockResult(lang);
    return { 
      ingredient_name: mockResult.ingredient_name,
      ingredient_desc: mockResult.ingredient_desc,
      freshness_level: mockResult.freshness_level,
      freshness_reason: mockResult.freshness_reason,
      imagePath: filePath 
    };
  }

  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    let isTimeout = false;
    
    const timer = setTimeout(() => {
      isTimeout = true;
      reject(new Error('timeout'));
    }, TIMEOUT_MS);

    wx.compressImage({
      src: filePath,
      quality: 60,
      compressedWidth: 800,
      compressedHeight: 800,
      success: (compressRes) => {
        uploadAndAnalyze(compressRes.tempFilePath);
      },
      fail: (err) => {
        console.error('[Analyze] Compress image failed, use original:', err);
        uploadAndAnalyze(filePath);
      }
    });

    function uploadAndAnalyze(targetPath) {
      wx.getFileSystemManager().readFile({
        filePath: targetPath,
        encoding: 'base64',
        success: (readRes) => {
          if (isTimeout) return;
          const base64Data = readRes.data;
          
          wx.cloud.callFunction({
            name: 'analyze',
            data: {
              action: 'analyze',
              analyzeType: 'vision',
              imageBase64: base64Data, // 直接传 base64
              userId: userId,
              source: 'wx_miniprogram',
              lang: lang
            },
            success: (res) => {
              if (isTimeout) return;
              clearTimeout(timer);
              
              if (res.result) {
                if (res.result.error) {
                  reject(new Error(res.result.errorType || 'model_error'));
                  return;
                }
                
                const data = res.result;
                resolve({
                  ingredient_name: data.ingredient_name || (lang === 'en' ? 'Unknown Ingredient' : '未知食材'),
                  ingredient_desc: data.ingredient_desc || (lang === 'en' ? 'No description' : '暂无描述'),
                  freshness_level: data.freshness_level || (lang === 'en' ? 'Unknown' : '未知'),
                  freshness_reason: data.freshness_reason || (lang === 'en' ? 'Unable to recognize freshness reason' : '未能识别鲜度原因'),
                  taste: data.taste || '',
                  texture: data.texture || '',
                  similar: data.similar || '',
                  imagePath: targetPath
                });
              } else {
                reject(new Error('bad_response'));
              }
            },
            fail: (err) => {
              if (isTimeout) return;
              clearTimeout(timer);
              console.error('[Analyze] Cloud function failed:', err);
              reject(new Error('network_error: ' + (err.errMsg || JSON.stringify(err))));
            }
          });
        },
        fail: (err) => {
          if (isTimeout) return;
          clearTimeout(timer);
          console.error('[Analyze] Read file failed:', err);
          reject(new Error('file_read_error: 读取图片失败 ' + (err.errMsg || '')));
        }
      });
    }
  });
}

/**
 * Step 2: 获取熟悉的味道与做法
 */
async function analyzeFamiliar(ingredientName, nationality, options = {}) {
  const forceMock = typeof options === 'boolean' ? options : !!options.forceMock;
  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    const mockResult = await getMockResult(lang);
    return {
      taste: mockResult.taste,
      texture: mockResult.texture,
      similar: mockResult.similar,
      recipes_familiar: mockResult.recipes.familiar
    };
  }

  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'analyze',
      data: {
        action: 'analyze',
        analyzeType: 'familiar',
        ingredientName: ingredientName,
        nationality: nationality,
        userId: userId,
        lang: lang
      },
      success: (res) => {
        if (res.result && !res.result.error) {
          const data = res.result;
          resolve({
            recipes_familiar: data.recipes_familiar || []
          });
        } else {
          reject(new Error(res.result?.errorType || 'model_error'));
        }
      },
      fail: (err) => {
        reject(new Error('network_error: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

/**
 * Step 3: 获取当地做法
 */
async function analyzeLocal(ingredientName, location, options = {}) {
  const forceMock = typeof options === 'boolean' ? options : !!options.forceMock;
  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    const mockResult = await getMockResult(lang);
    return {
      recipes_local: mockResult.recipes.local
    };
  }

  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'analyze',
      data: {
        action: 'analyze',
        analyzeType: 'local',
        ingredientName: ingredientName,
        location: location,
        userId: userId,
        lang: lang
      },
      success: (res) => {
        if (res.result && !res.result.error) {
          resolve({
            recipes_local: res.result.recipes_local || []
          });
        } else {
          reject(new Error(res.result?.errorType || 'model_error'));
        }
      },
      fail: (err) => {
        reject(new Error('network_error: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

module.exports = {
  analyzeImage,
  analyzeFamiliar,
  analyzeLocal,
  MOCK_DATA_ZH,
  MOCK_DATA_EN
};