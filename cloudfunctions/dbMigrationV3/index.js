// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('Phase 6 Migration started: Extracting recipes from shopping_lists...')
  const results = {
    recipesAdded: 0,
    errors: []
  }

  try {
    // 1. 使用聚合操作提取所有用户的有效菜谱
    const res = await db.collection('shopping_lists').aggregate()
      .unwind('$items')
      .match({ 'items.sourceRecipe': _.nin(['', '其他', '直接添加', null]) })
      .group({
        _id: {
          openid: '$_openid',
          recipeName: '$items.sourceRecipe'
        },
        createdAt: $.max('$items.createdAt'),
        ingredients: $.addToSet('$items.name')
      })
      .limit(10000) // 假设数据量在这个范围内，如超出会需分页
      .end()

    console.log(`Found ${res.list.length} unique recipes across all users.`)

    // 2. 遍历聚合结果，逐个检查并在 recipes 集合中创建
    for (const item of res.list) {
      const openid = item._id.openid;
      const recipeName = item._id.recipeName;
      const ingredientsList = item.ingredients || [];
      const createdAt = item.createdAt || new Date();

      if (!openid || !recipeName) continue;

      try {
        // 检查是否已经存在
        const { data: existing } = await db.collection('recipes').where({
          _openid: openid,
          recipeName: recipeName
        }).get();

        if (existing && existing.length > 0) {
          // 已经存在则跳过
          continue;
        }

        // 写入新记录
        await db.collection('recipes').add({
          data: {
            _openid: openid,
            recipeName: recipeName,
            ingredientName: recipeName, // 暂用菜谱名作为关联食材名
            ingredientsNeeded: ingredientsList,
            sourceType: 'familiar', // 默认视为熟悉做法
            cloudImagePath: '',
            createdAt: createdAt,
            updatedAt: new Date()
          }
        });
        results.recipesAdded++;
      } catch (err) {
        console.error(`Failed to add recipe ${recipeName} for user ${openid}:`, err);
        results.errors.push(`[${openid}] ${recipeName}: ${err.message}`);
      }
    }

    console.log('Phase 6 Migration finished:', results)
    return {
      success: true,
      results
    }
  } catch (err) {
    console.error('Phase 6 Migration failed:', err)
    return {
      success: false,
      error: err.message,
      results
    }
  }
}