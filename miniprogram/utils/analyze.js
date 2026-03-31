const MOCK_DATA_ZH = {
  ingredient_name: "本地Mock鲈鱼",
  ingredient_desc: "适合清蒸，注意去腥",
  taste: "鲜甜",
  texture: "肉质细嫩，蒜瓣肉",
  similar: "黑鱼",
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

const MOCK_DATA_EN = {
  ingredient_name: "Local Mock Sea Bass",
  ingredient_desc: "Suitable for steaming, remember to remove fishy smell",
  taste: "Fresh and sweet",
  texture: "Tender meat, flaky texture",
  similar: "Snakehead",
  freshness_level: "Fresh",
  freshness_reason: "Clear and slightly protruding eyes, shiny skin",
  recipes: [
    {
      recipe_name: "Steamed Sea Bass",
      ingredients_needed: ["Scallion", "Ginger", "Cooking wine", "Steamed fish soy sauce", "Cooking oil"]
    },
    {
      recipe_name: "Braised Sea Bass",
      ingredients_needed: ["Scallion", "Ginger", "Garlic", "Light soy sauce", "Dark soy sauce", "Sugar", "Cooking wine"]
    }
  ]
};

// 模式：'cloudfunction' | 'mock'
// 在 MVP 阶段，如果云环境未配置好，可以手动改成 'mock'
const MODE = 'cloudfunction'; 
const TIMEOUT_MS = 95000; // 95秒超时保护 (比云函数稍长一点)

function getMockResult(lang) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(lang === 'en' ? MOCK_DATA_EN : MOCK_DATA_ZH);
    }, 1500); // 模拟网络延迟
  });
}

/**
 * 统一分析入口
 * @param {string} filePath 图片本地路径
 * @param {boolean} forceMock 强制使用本地 mock，即使出错也静默回退
 */
async function analyzeImage(filePath, forceMock = false) {
  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    console.log('[Analyze] Using local mock data, lang:', lang);
    const mockResult = await getMockResult(lang);
    return { ...mockResult, imagePath: filePath };
  }

  // 获取 userId
  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    let isTimeout = false;
    
    const timer = setTimeout(() => {
      isTimeout = true;
      reject(new Error('timeout'));
    }, TIMEOUT_MS);

    // 1. 压缩图片
    wx.compressImage({
      src: filePath,
      quality: 60,
      success: (compressRes) => {
        const compressedPath = compressRes.tempFilePath;
        uploadAndAnalyze(compressedPath);
      },
      fail: (err) => {
        console.error('[Analyze] Compress image failed, use original:', err);
        // 压缩失败则回退到直接使用原图
        uploadAndAnalyze(filePath);
      }
    });

    function uploadAndAnalyze(targetPath) {
      // 2. 上传图片到云存储
      const ext = targetPath.match(/\.([^.]+)$/)?.[1] || 'jpg';
      const cloudPath = `uploads/${userId}_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: targetPath,
        success: (uploadRes) => {
          if (isTimeout) return;
          const fileID = uploadRes.fileID;
          
          // 3. 调用云函数，传递 fileID
          wx.cloud.callFunction({
            name: 'analyze',
            data: {
              action: 'analyze',
              fileID: fileID,
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
                
                // 处理 similar 字段，防止模型仍然返回了带"类似"前缀的脏数据
                let cleanSimilar = data.similar || '';
                if (cleanSimilar) {
                  // 移除开头的"类似"、"类似于"、"口感像"、"像"等词汇
                  cleanSimilar = cleanSimilar.replace(/^(类似[于]?|口感[像]?|像)/, '').trim();
                }

                const result = {
                  ingredient_name: data.ingredient_name || (lang === 'en' ? 'Unknown Ingredient' : '未知食材'),
                  ingredient_desc: data.ingredient_desc || (lang === 'en' ? 'No description' : '暂无描述'),
                  taste: data.taste || '',
                  texture: data.texture || '',
                  similar: cleanSimilar,
                  freshness_level: data.freshness_level || (lang === 'en' ? 'Unknown' : '未知'),
                  freshness_reason: data.freshness_reason || (lang === 'en' ? 'Unable to recognize freshness reason' : '未能识别鲜度原因'),
                  recipes: Array.isArray(data.recipes) && data.recipes.length > 0 ? data.recipes.map(r => ({
                    recipe_name: r.recipe_name || (lang === 'en' ? 'Unknown Recipe' : '未知做法'),
                    ingredients_needed: Array.isArray(r.ingredients_needed) ? r.ingredients_needed : [(lang === 'en' ? 'Unknown Ingredient' : '未知佐料')]
                  })) : [],
                  imagePath: targetPath,
                  cloudImagePath: fileID
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
              reject(new Error('network_error: ' + (err.errMsg || JSON.stringify(err))));
            }
          });
        },
        fail: (err) => {
          if (isTimeout) return;
          clearTimeout(timer);
          console.error('[Analyze] Upload file failed:', err);
          reject(new Error('network_error: 上传图片失败 ' + (err.errMsg || '')));
        }
      });
    }
  });
}

module.exports = {
  analyzeImage,
  MOCK_DATA
};