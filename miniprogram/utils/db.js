// db.js
// 数据库配置与实体声明，适配 V2 双引擎架构
const db = wx.cloud.database();
const originalCollection = db.collection.bind(db);

const COLLECTIONS = {
  USERS: 'users',
  SHOPPING_LISTS: 'shopping_lists',
  HISTORIES: 'histories',
  CACHES: 'caches',
  FEEDBACKS: 'feedbacks',
  RECIPES: 'recipes'
};

/**
 * 动态路由获取集合：根据当前 authSource 决定是否返回 temp_ 前缀集合
 * @param {string} name - 集合名称
 */
function getCollection(name) {
  const auth = require('./auth.js');
  const authSource = auth.getAuthSource();
  
  const tempEnabledCollections = [
    COLLECTIONS.SHOPPING_LISTS,
    COLLECTIONS.HISTORIES,
    COLLECTIONS.RECIPES
  ];

  if (authSource === 'anonymous' && tempEnabledCollections.includes(name)) {
    return originalCollection(`temp_${name}`);
  }
  return originalCollection(name);
}

// 覆盖默认的 collection 方法，实现全局无缝路由
db.collection = getCollection;

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
  ensureActiveList,
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
 * 获取活跃清单，如不存在则创建。标题由外部传入，解耦 i18n
 * @param {Object} options
 * @param {string} options.title - 清单标题
 * @returns {Promise<string>} 返回 active list 的 _id
 */
async function ensureActiveList({ title }) {
  const collection = getCollection(COLLECTIONS.SHOPPING_LISTS);
  const auth = require('./auth.js');
  const userId = auth.getUserId();
  const _ = db.command;
  
  const query = userId ? _.and([
    { status: 'active' },
    { _openid: userId }
  ]) : { status: 'active', _openid: 'unauthenticated' };

  const res = await collection.where(query).orderBy('createdAt', 'desc').limit(1).get();

  if (res.data && res.data.length > 0) {
    return res.data[0]._id;
  }

  const newList = {
    title: title || 'Shopping List',
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
 * @deprecated 请使用 ensureActiveList 并从外部传入 title
 * [M2.1] 获取今日活跃清单
 * @returns {Promise<string>} 返回 active list 的 _id
 */
async function getActiveList() {
  const app = getApp();
  const { makeDefaultListTitle } = require('./listTitle.js');
  const title = makeDefaultListTitle(app ? app.globalData.i18n : null);
  return ensureActiveList({ title });
}

/**
 * 获取指定清单及其 items
 */
async function getListById(listId) {
  if (!listId) return null;
  try {
    const res = await getCollection(COLLECTIONS.SHOPPING_LISTS).doc(listId).get();
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

