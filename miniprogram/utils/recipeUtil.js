const auth = require('./auth.js');
const app = getApp();

/**
 * 通用食谱收藏逻辑
 * @param {Object} params 
 * @param {String} params.recipeName 食谱名称
 * @param {Array} params.ingredients 食材列表 [{name: '...'}]
 * @param {String} [params.sourceType='familiar'] 来源
 * @param {String} [params.imagePath=''] 本地图片路径 (仅 recipe 页面需要)
 * @param {String} [params.cloudImagePath=''] 已有的云端图片路径
 * @param {String} [params.ingredientName=''] 关联的主食材名称
 * @returns {Promise<{success: boolean, handled: boolean, message: string, code: string, cloudImagePath: string}>}
 */
async function saveRecipe(params) {
  if (!auth.checkAndUpgrade()) {
    return { success: false, handled: true, message: 'Need upgrade' };
  }

  const { recipeName, ingredients, sourceType = 'familiar', imagePath = '', cloudImagePath = '', ingredientName = '' } = params;
  
  // 过滤无效食谱名称
  const invalidNames = ['list_independent_ingredients', 'list_other_ingredients', 'list_direct_add'];
  if (!recipeName || invalidNames.includes(recipeName)) {
    return { success: false, handled: true, message: 'Invalid recipe name' };
  }

  wx.showLoading({ title: app.t('recipe_saving'), mask: true });

  try {
    const db = wx.cloud.database();
    const userId = app.globalData.userId || wx.getStorageSync('pf_user_id');

    // 1. 查重
    const { data: existing } = await db.collection('recipes').where({
      _openid: userId,
      recipeName: recipeName
    }).get();

    if (existing && existing.length > 0) {
      wx.hideLoading();
      return { success: false, handled: false, message: app.t('recipe_saved_already'), code: 'ALREADY_SAVED', cloudImagePath };
    }

    // 2. 处理图片上传 (兼容 pages/recipe 的需求)
    let finalCloudImagePath = cloudImagePath;
    if (imagePath && !imagePath.startsWith('cloud://') && !finalCloudImagePath) {
      try {
        const ext = imagePath.match(/\.([^.]+)$/)?.[1] || 'jpg';
        const cloudPath = `recipes/${userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}.${ext}`;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: imagePath });
        finalCloudImagePath = uploadRes.fileID;
      } catch (uploadErr) {
        console.error('上传菜谱封面图失败:', uploadErr);
      }
    }

    // 3. 存入数据库
    await db.collection('recipes').add({
      data: {
        recipeName,
        ingredientName: ingredientName || recipeName, 
        ingredientsNeeded: (ingredients || []).map(ing => ing.name || ing),
        sourceType,
        cloudImagePath: finalCloudImagePath,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    wx.hideLoading();
    return { success: true, handled: false, message: app.t('recipe_saved_success'), cloudImagePath: finalCloudImagePath };
  } catch (err) {
    console.error('[recipeUtil] saveRecipe failed:', err);
    wx.hideLoading();
    return { success: false, handled: false, message: app.t('recipe_save_failed'), code: 'ERROR' };
  }
}

module.exports = { saveRecipe };
