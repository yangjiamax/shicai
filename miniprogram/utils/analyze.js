// 模式：'cloudfunction' | 'mock'
// 在 MVP 阶段，如果云环境未配置好，可以手动改成 'mock'
const MODE = 'cloudfunction'; 
const TIMEOUT_MS = 60000; // 统一60秒超时保护
const TEXT_TIMEOUT_MS = 60000; // 文本生成统一60秒超时

function getMockResult(lang) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const { MOCK_DATA_ZH, MOCK_DATA_EN } = require('../mock/analyzeMock.js');
      resolve(lang === 'en' ? MOCK_DATA_EN : MOCK_DATA_ZH);
    }, 1500); // 模拟网络延迟
  });
}

/**
 * 一次性智能压缩图片，通过分辨率预判直接计算最佳比例，避免多次循环造成的耗时
 * @param {string} filePath 原图路径
 * @param {number} targetSizeKB 目标大小(KB)
 * @returns {Promise<string>} 压缩后的临时路径
 */
function compressToTargetSize(filePath, targetSizeKB = 250) {
  return new Promise(async (resolve, reject) => {
    const targetBytes = targetSizeKB * 1024;
    
    // 1. 获取文件大小和尺寸信息（并行获取提高速度）
    let fileInfo, imageInfo;
    try {
      [fileInfo, imageInfo] = await Promise.all([
        new Promise((res, rej) => wx.getFileInfo({ filePath, success: res, fail: rej })),
        new Promise((res, rej) => wx.getImageInfo({ src: filePath, success: res, fail: rej }))
      ]);
    } catch (e) {
      console.warn('[Compress] 获取原图信息失败，使用极限兜底压缩', e);
      return executeCompress(filePath, 800, 800).then(resolve);
    }

    if (fileInfo.size <= targetBytes) {
      console.log(`[Compress] 原图 ${(fileInfo.size / 1024).toFixed(2)}KB 已达标，无需压缩`);
      return resolve(filePath);
    }

    const originWidth = imageInfo.width;
    const originHeight = imageInfo.height;
    
    // 2. 核心算法：根据文件超标的倍数，计算出合理的尺寸缩放比例和画质
    // 假设：文件大小与(宽*高*quality)粗略成正比
    const sizeRatio = targetBytes / fileInfo.size; // 比如目标250k，原图2.5M，ratio就是0.1
    
    // 我们让长宽各承担 sqrt(sizeRatio) 的缩放压力，quality 承担剩下的压力
    // 为了保险起见，我们将缩放系数再乘以 0.7 作为更保守的安全冗余
    let scale = Math.sqrt(sizeRatio) * 0.7;
    
    // 限制缩放比例的上下限，防止把图压成马赛克或缩得太小
    if (scale > 0.8) scale = 0.8;
    if (scale < 0.2) scale = 0.2;

    const targetWidth = Math.floor(originWidth * scale);
    const targetHeight = Math.floor(originHeight * scale);

    console.log(`[Compress] 单次计算结果 - sizeRatio: ${sizeRatio.toFixed(3)}, scale: ${scale.toFixed(3)}, target: ${targetWidth}x${targetHeight}`);

    // 3. 执行单次压缩
    try {
      let currentPath = filePath;
      // 处理 iOS 上可能出现的格式问题，有时 wx.compressImage 可能会因为某些原图格式(如HEIC)表现异常
      // 虽然微信声称 chooseImage 会转 JPG，但保险起见
      // 现在我们直接使用 Canvas 重绘，不仅压缩，还彻底剥离 EXIF
      currentPath = await executeCompress(filePath, targetWidth, targetHeight);
      
      // 添加一个极简的最后防线验证
      const finalFileInfo = await new Promise((res, rej) => wx.getFileInfo({ filePath: currentPath, success: res, fail: rej }));
      console.log(`[Compress] 压缩后大小: ${(finalFileInfo.size / 1024).toFixed(2)}KB`);
      
      if (finalFileInfo.size > targetBytes) {
          console.warn(`[Compress] 单次压缩后仍超标，执行兜底重压`);
          // 进一步降低画质和尺寸
          currentPath = await executeCompress(currentPath, Math.floor(originWidth * 0.2), Math.floor(originHeight * 0.2));
          
          // 终极绝杀：如果在兜底重压后依然大于 500KB (极罕见异常)，为了保命，不再传给云端，抛出错误提示用户重拍
          const killFileInfo = await new Promise((res, rej) => wx.getFileInfo({ filePath: currentPath, success: res, fail: rej }));
          if (killFileInfo.size > 600 * 1024) {
             throw new Error('Image too complex to compress');
          }
      }
      
      resolve(currentPath);
    } catch (e) {
      console.error('[Compress] 压缩执行异常:', e);
      // 如果压缩失败，**千万不要返回原图**，因为原图100%会导致云函数崩溃。
      // 直接 reject 掉，让上层业务提示用户重新拍照。
      reject(e);
    }
  });
}

// 提取的底层压缩执行函数，使用 Canvas 重绘以彻底清除 EXIF 并且精准控制尺寸
function executeCompress(src, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    // 使用小程序的离屏 Canvas，不需要在 wxml 里写 <canvas> 标签
    const offscreenCanvas = wx.createOffscreenCanvas({ type: '2d', width: targetWidth, height: targetHeight });
    const context = offscreenCanvas.getContext('2d');
    const image = offscreenCanvas.createImage();

    image.onload = () => {
      // 将原图绘制到缩小的画布上
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      
      // 导出纯净的 JPEG 图片数据
      // 导出的数据已经不含任何 EXIF 信息，并且被压缩到了指定宽高
      const base64Data = offscreenCanvas.toDataURL('image/jpeg', 0.8);
      
      // toDataURL 返回的是 "data:image/jpeg;base64,xxxx"
      // 我们需要把它存为临时文件，以便后续流程统一处理
      const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const fsm = wx.getFileSystemManager();
      const tempFilePath = `${wx.env.USER_DATA_PATH}/pf_compressed_${Date.now()}.jpg`;
      
      fsm.writeFile({
        filePath: tempFilePath,
        data: base64Content,
        encoding: 'base64',
        success: () => resolve(tempFilePath),
        fail: (err) => {
          console.error('[Canvas Compress] 写入临时文件失败', err);
          reject(err);
        }
      });
    };

    image.onerror = (err) => {
      console.error('[Canvas Compress] 加载原图失败', err);
      reject(err);
    };

    image.src = src;
  });
}

/**
 * Step 1: 极速认物（仅识别食材名称）
 */
async function analyzeIdentify(filePath, options = {}) {
  const forceMock = typeof options === 'boolean' ? options : !!options.forceMock;

  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    console.log('[Analyze] Using local mock data, lang:', lang);
    const mockResult = await getMockResult(lang);
    return { 
      ingredientName: mockResult.ingredientName,
      imagePath: filePath,
      base64Data: 'mock_base64_data'
    };
  }

  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    let isTimeout = false;
    
    const timer = setTimeout(() => {
      isTimeout = true;
      reject(new Error('timeout'));
    }, TIMEOUT_MS);

    compressToTargetSize(filePath, 250).then(compressedPath => {
      if (!isTimeout) uploadAndAnalyze(compressedPath);
    }).catch(err => {
      console.error('[Analyze] Compress image failed or still too large:', err);
      if (!isTimeout) {
         clearTimeout(timer);
         reject(new Error('image_compress_failed: 图片过于复杂或格式不受支持，请尝试使用相册选择其他图片'));
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
              analyzeType: 'identify',
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
                  ingredientName: data.ingredientName || data.ingredient_name || (lang === 'en' ? 'Unknown Ingredient' : '未知食材'),
                  imagePath: targetPath,
                  base64Data: base64Data
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
 * Step 2 Track A: 视觉分析（仅鉴定鲜度）
 */
async function analyzeVision(base64Data, ingredientName, options = {}) {
  const forceMock = typeof options === 'boolean' ? options : !!options.forceMock;
  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    const mockResult = await getMockResult(lang);
    return {
      freshnessLevel: mockResult.freshnessLevel,
      freshnessReason: mockResult.freshnessReason
    };
  }

  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'analyze',
      data: {
        action: 'analyze',
        analyzeType: 'vision',
        imageBase64: base64Data,
        ingredientName: ingredientName,
        userId: userId,
        lang: lang
      },
      success: (res) => {
        if (res.result && !res.result.error) {
          const data = res.result;
          resolve({
            freshnessLevel: data.freshnessLevel || data.freshness_level || (lang === 'en' ? 'Unknown' : '未知'),
            freshnessReason: data.freshnessReason || data.freshness_reason || (lang === 'en' ? 'Unable to recognize freshness reason' : '未能识别鲜度原因')
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
 * Step 2 Track B1: 知识百科分析（口感、简介等）
 */
async function analyzeKnowledge(ingredientName, options = {}) {
  const forceMock = typeof options === 'boolean' ? options : !!options.forceMock;
  const app = getApp();
  const lang = app ? app.globalData.language : 'zh';

  if (MODE === 'mock' || forceMock) {
    const mockResult = await getMockResult(lang);
    return {
      ingredientDesc: mockResult.ingredientDesc,
      taste: mockResult.taste,
      texture: mockResult.texture,
      similar: mockResult.similar
    };
  }

  const userId = wx.getStorageSync('pf_user_id') || 'anonymous';

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'analyze',
      data: {
        action: 'analyze',
        analyzeType: 'knowledge',
        ingredientName: ingredientName,
        userId: userId,
        lang: lang
      },
      success: (res) => {
        if (res.result && !res.result.error) {
          const data = res.result;
          resolve({
            ingredientDesc: data.ingredientDesc || data.ingredient_desc || (lang === 'en' ? 'No description' : '暂无描述'),
            taste: data.taste || '',
            texture: data.texture || '',
            similar: data.similar || ''
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
      recipesFamiliar: mockResult.recipes.familiar
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
            recipesFamiliar: data.recipesFamiliar || data.recipes_familiar || []
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
      recipesLocal: mockResult.recipes.local
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
            recipesLocal: res.result.recipesLocal || res.result.recipes_local || []
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
  analyzeIdentify,
  analyzeVision,
  analyzeKnowledge,
  analyzeFamiliar,
  analyzeLocal
};