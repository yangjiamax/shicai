// db.js
// 数据库配置与实体声明，适配 V2 双引擎架构
const db = wx.cloud.database();

const COLLECTIONS = {
  SHOPPING_LISTS: 'shopping_lists',
  INGREDIENTS: 'ingredients',
  HISTORY: 'history' // V1 遗留的识物历史记录
};

/**
 * Entity: Shopping List (购物清单)
 * @typedef {Object} ShoppingList
 * @property {string} _id - 数据库自动生成的 _id (作为 list_id)
 * @property {string} _openid - 微信用户的 openid (作为 user_id)
 * @property {string} title - 清单标题，如 "2026-04-03 购物清单"
 * @property {string} status - 状态: "active" (活跃中) | "completed" (已完成)
 * @property {number} created_at - 创建时间戳
 */

/**
 * Entity: Ingredient (清单内的食材项)
 * @typedef {Object} Ingredient
 * @property {string} _id - 数据库自动生成的 _id
 * @property {string} _openid - 微信用户的 openid
 * @property {string} list_id - 关联的购物清单 _id
 * @property {string} name - 原始名称，如 "排骨"
 * @property {string} standard_name - AI 归一化后的标准名称，如 "猪排骨"
 * @property {string} category - 超市动线分类，如 "肉类海鲜区"
 * @property {string} source_recipe - 来源菜谱，如 "糖醋排骨" (为空代表直接添加)
 * @property {string} status - 状态: "pending" (待买) | "bought" (已买) | "deleted" (已删除)
 * @property {number} add_time - 添加时间戳
 */

module.exports = {
  db,
  COLLECTIONS,
  getActiveList,
  addIngredientsToList
};

/**
 * [M2.1] 获取今日活跃清单
 * 检查今日是否已有未完成的购物清单。如果有，则获取其 `list_id`；
 * 如果没有，则自动创建一个标题为“YYYY-MM-DD 购物清单”的新 List。
 * @returns {Promise<string>} 返回 active list 的 _id
 */
async function getActiveList() {
  const collection = db.collection(COLLECTIONS.SHOPPING_LISTS);
  
  // 查询状态为 active 的清单，可以加个日期限制或者只查 active 状态即可（假设 active 就是当前的）
  const res = await collection.where({
    status: 'active'
  }).orderBy('created_at', 'desc').limit(1).get();

  if (res.data && res.data.length > 0) {
    return res.data[0]._id;
  }

  // 如果没有，创建新的
  const dateObj = new Date();
  const yy = dateObj.getFullYear().toString().substring(2);
  const mm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const dd = dateObj.getDate().toString().padStart(2, '0');
  
  const newList = {
    title: `${yy}-${mm}-${dd} 采购清单`,
    status: 'active',
    created_at: Date.now()
  };

  const addRes = await collection.add({
    data: newList
  });

  return addRes._id;
}

/**
 * 批量添加食材到指定的清单
 * @param {string} listId 清单 _id
 * @param {Array<Object>} ingredients 食材列表
 */
async function addIngredientsToList(listId, ingredients) {
  if (!listId || !ingredients || ingredients.length === 0) return;
  
  const collection = db.collection(COLLECTIONS.INGREDIENTS);
  
  // 小程序端 db 限制了不能直接通过 add() 批量添加对象数组，需要循环添加，或者通过云函数批量添加
  // 这里先简单使用 Promise.all 并发添加，如果量大建议走云函数
  const promises = ingredients.map(item => {
    return collection.add({
      data: {
        list_id: listId,
        name: item.name || item.standard_name,
        standard_name: item.standard_name,
        category: item.category,
        source_recipe: item.source_recipe || '',
        status: 'pending',
        add_time: Date.now()
      }
    });
  });

  await Promise.all(promises);
}

