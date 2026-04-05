// db.js
// 数据库配置与实体声明，适配 V2 双引擎架构
const db = wx.cloud.database();

const COLLECTIONS = {
  USERS: 'users',
  SHOPPING_LISTS: 'shopping_lists',
  HISTORIES: 'histories',
  CACHES: 'caches',
  FEEDBACKS: 'feedbacks'
};

/**
 * Entity: Shopping List (购物清单)
 * @typedef {Object} ShoppingList
 * @property {string} _id - 数据库自动生成的 _id
 * @property {string} _openid - 微信用户的 openid
 * @property {string} title - 清单标题
 * @property {string} status - 状态: "active" | "completed"
 * @property {Array<Ingredient>} items - 内嵌食材数组
 * @property {Date} createdAt - 创建时间
 * @property {Date} updatedAt - 更新时间
 */

/**
 * Entity: Item (清单内的食材项)
 * @typedef {Object} Item
 * @property {string} id - 自动生成的唯一 ID
 * @property {string} name - 原始名称
 * @property {string} standardName - 驼峰命名，标准名称
 * @property {string} category - 超市动线分类
 * @property {string} sourceRecipe - 驼峰命名，来源菜谱
 * @property {string} status - 状态: "pending" | "bought"
 * @property {Date} createdAt - 创建时间
 */

module.exports = {
  db,
  COLLECTIONS,
  getActiveList,
  getListById,
  addIngredientsToList,
  updateIngredientStatus,
  updateIngredientName,
  deleteIngredients,
  deleteRecipe
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * [M2.1] 获取今日活跃清单
 * @returns {Promise<string>} 返回 active list 的 _id
 */
async function getActiveList() {
  const collection = db.collection(COLLECTIONS.SHOPPING_LISTS);
  const auth = require('./auth.js');
  const userId = auth.getUserId();
  const _ = db.command;
  
  const query = userId ? _.and([
    { status: 'active' },
    { _openid: userId }
  ]) : { status: 'active', user_id: 'unauthenticated' };

  const res = await collection.where(query).orderBy('createdAt', 'desc').limit(1).get();

  if (res.data && res.data.length > 0) {
    return res.data[0]._id;
  }

  const dateObj = new Date();
  const mm = (dateObj.getMonth() + 1).toString();
  const dd = dateObj.getDate().toString();
  const hour = dateObj.getHours();
  
  const app = getApp();
  
  let timePrefix = '';
  let title = '';

  if (app && app.t) {
    const timePrefixKey = hour >= 5 && hour < 12 ? 'my_time_morning' : (hour >= 12 && hour < 18 ? 'my_time_noon' : 'my_time_evening');
    timePrefix = app.t(timePrefixKey);
    title = app.t('my_shopping_list_title').replace('{mm}', mm).replace('{dd}', dd).replace('{timePrefix}', timePrefix);
  } else {
    if (hour >= 5 && hour < 12) timePrefix = '早上';
    else if (hour >= 12 && hour < 18) timePrefix = '中午';
    else timePrefix = '晚上';
    title = `${mm}月${dd}日${timePrefix}的采购单`;
  }
  
  const newList = {
    title: title,
    status: 'active',
    items: [],
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const addRes = await collection.add({
    data: newList
  });

  return addRes._id;
}

/**
 * 获取指定清单及其 items
 */
async function getListById(listId) {
  if (!listId) return null;
  try {
    const res = await db.collection(COLLECTIONS.SHOPPING_LISTS).doc(listId).get();
    return res.data;
  } catch (err) {
    console.error('getListById error:', err);
    return null;
  }
}

/**
 * 批量添加食材到指定的清单 (内嵌 items)
 */
async function addIngredientsToList(listId, ingredients) {
  if (!listId || !ingredients || ingredients.length === 0) return;
  
  const formattedItems = ingredients.map(item => ({
    id: generateId(),
    name: item.name || item.standardName,
    standardName: item.standardName || item.name,
    category: item.category || '其他',
    sourceRecipe: item.sourceRecipe || '',
    status: 'pending',
    createdAt: db.serverDate()
  }));

  const updateData = {
    items: db.command.push(formattedItems),
    updatedAt: db.serverDate()
  };

  await db.collection(COLLECTIONS.SHOPPING_LISTS).doc(listId).update({
    data: updateData
  });
}

/**
 * 批量更新食材状态
 */
async function updateIngredientStatus(listId, itemIds, newStatus) {
  if (!listId || !itemIds || itemIds.length === 0) return;
  
  const list = await getListById(listId);
  if (!list || !list.items) return;

  const items = list.items.map(item => {
    if (itemIds.includes(item.id)) {
      return { ...item, status: newStatus };
    }
    return item;
  });

  await db.collection(COLLECTIONS.SHOPPING_LISTS).doc(listId).update({
    data: {
      items: items,
      updatedAt: db.serverDate()
    }
  });
}

/**
 * 批量更新食材名称
 */
async function updateIngredientName(listId, itemIds, newName) {
  if (!listId || !itemIds || itemIds.length === 0) return;
  
  const list = await getListById(listId);
  if (!list || !list.items) return;

  const items = list.items.map(item => {
    if (itemIds.includes(item.id)) {
      return { ...item, name: newName, standardName: newName };
    }
    return item;
  });

  await db.collection(COLLECTIONS.SHOPPING_LISTS).doc(listId).update({
    data: {
      items: items,
      updatedAt: db.serverDate()
    }
  });
}

/**
 * 批量删除食材 (从数组中移除)
 */
async function deleteIngredients(listId, itemIds) {
  if (!listId || !itemIds || itemIds.length === 0) return;
  
  const list = await getListById(listId);
  if (!list || !list.items) return;

  const items = list.items.filter(item => !itemIds.includes(item.id));

  await db.collection(COLLECTIONS.SHOPPING_LISTS).doc(listId).update({
    data: {
      items: items,
      updatedAt: db.serverDate()
    }
  });
}

/**
 * 删除整道菜的所有食材
 */
async function deleteRecipe(listId, recipeName) {
  if (!listId || !recipeName) return;
  
  const list = await getListById(listId);
  if (!list || !list.items) return;

  const items = list.items.filter(item => item.sourceRecipe !== recipeName);

  await db.collection(COLLECTIONS.SHOPPING_LISTS).doc(listId).update({
    data: {
      items: items,
      updatedAt: db.serverDate()
    }
  });
}

