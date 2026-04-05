// listUtil.js
// [M2.3] 前端双视角状态推导

/**
 * 逐道菜选购 (按菜谱分组)
 * @param {Array<Object>} ingredients - 当前活跃清单的所有食材数据
 * @returns {Array<Object>} 按 sourceRecipe 分组的数据结构
 */
function derivePlanningView(ingredients) {
  if (!ingredients || ingredients.length === 0) return [];

  const groupMap = {};

  ingredients.forEach(item => {
    // 如果没有来源菜谱，统一归为"独立食材"
    const independentKey = 'list_independent_ingredients';
    const otherKey = '其他';
    const directAddKey = '直接添加';
    
    let recipeName = item.sourceRecipe || independentKey;
    
    if (recipeName === otherKey || recipeName === directAddKey) {
      recipeName = independentKey;
    }

    if (!groupMap[recipeName]) {
      groupMap[recipeName] = {
        title: recipeName,
        items: []
      };
    }
    
    groupMap[recipeName].items.push(item);
  });

  // 把 "独立食材" 放在数组的最后
  const result = Object.values(groupMap);
  result.sort((a, b) => {
    if (a.title === 'list_independent_ingredients') return 1;
    if (b.title === 'list_independent_ingredients') return -1;
    return 0;
  });

  return result;
}

/**
 * 汇总选购 (按超市动线分类分组，并合并同名食材)
 * @param {Array<Object>} ingredients - 当前活跃清单的所有食材数据
 * @returns {Array<Object>} 分为鱼鲜肉蛋、生鲜蔬果、粮油配料、其他，并对相同 standardName 进行合并
 */
function deriveExecutionView(ingredients) {
  if (!ingredients || ingredients.length === 0) return [];

  const mergeItems = (items) => {
    const mergedMap = {};
    items.forEach(item => {
      const nameKey = item.standardName || item.name;
      if (!mergedMap[nameKey]) {
        mergedMap[nameKey] = {
          ...item,
          original_ids: [item.id || item._id]
        };
      } else {
        mergedMap[nameKey].original_ids.push(item.id || item._id);
        if (item.status === 'pending') {
          mergedMap[nameKey].status = 'pending';
        }
      }
    });
    return Object.values(mergedMap);
  };

  const categoryMap = {
    '鱼鲜肉蛋': [],
    '生鲜蔬果': [],
    '粮油配料': [],
    '其他': []
  };

  const enCategoryMap = {
    'Seafood, Meat & Eggs': '鱼鲜肉蛋',
    'Fresh Produce': '生鲜蔬果',
    'Grains, Oils & Condiments': '粮油配料',
    'Others': '其他',
    'other': '其他',
    // 兼容旧数据
    '蔬菜区': '生鲜蔬果',
    '水果区': '生鲜蔬果',
    '肉类禽蛋': '鱼鲜肉蛋',
    '海鲜水产': '鱼鲜肉蛋',
    '冷冻冷藏': '其他',
    '调料干货': '粮油配料',
    '零食饮料': '其他',
    '粮油米面': '粮油配料',
    '日用百货': '其他',
    'Meat & Poultry': '鱼鲜肉蛋',
    'Seafood': '鱼鲜肉蛋',
    'Vegetables': '生鲜蔬果',
    'Fruits': '生鲜蔬果',
    'Spices & Dry Goods': '粮油配料',
    'Grains & Oils': '粮油配料',
    'Frozen & Chilled': '其他',
    'Snacks & Beverages': '其他',
    'Daily Supplies': '其他'
  };

  // 简单的启发式分类，用于处理历史 "其他" 或手动添加没有分类的食材
  const guessCategory = (name) => {
    if (!name) return '其他';
    
    const seafoodMeatEggs = /肉|鸡|鸭|鹅|鱼|虾|蟹|贝|蛋|排骨|牛|羊|猪|鸽|鹌鹑|蹄|肠|丸/i;
    const produce = /菜|葱|姜|蒜|果|瓜|豆|菇|笋|椒|薯|萝卜|花|叶|苔|藤|芹|芋/i;
    const condiments = /油|盐|酱|醋|糖|酒|米|面|粉|香料|八角|桂皮|花椒|生抽|老抽|味精|鸡精|蚝油|豆瓣|干粉/i;

    if (seafoodMeatEggs.test(name)) return '鱼鲜肉蛋';
    if (produce.test(name)) return '生鲜蔬果';
    if (condiments.test(name)) return '粮油配料';
    
    return '其他';
  };

  // Group by category
  ingredients.forEach(item => {
    let cat = item.category || '其他';
    // Handle EN or old categories
    if (enCategoryMap[cat]) {
      cat = enCategoryMap[cat];
    } else if (!categoryMap[cat]) {
      cat = '其他';
    }

    // 如果是“其他”，尝试通过名称推断真实分类
    if (cat === '其他') {
      const nameToGuess = item.standardName || item.name;
      cat = guessCategory(nameToGuess);
    }

    categoryMap[cat].push(item);
  });

  const applySuggestMerge = (mergedItems) => {
    for (let i = 0; i < mergedItems.length; i++) {
      for (let j = i + 1; j < mergedItems.length; j++) {
        const itemA = mergedItems[i];
        const itemB = mergedItems[j];
        if (itemA.status === 'pending' && itemB.status === 'pending') {
          const nameA = itemA.standardName || itemA.name;
          const nameB = itemB.standardName || itemB.name;
          if ((nameA.includes(nameB) || nameB.includes(nameA)) && nameA !== nameB) {
            itemA.suggestMerge = true;
            itemA.mergeTargetName = nameB;
            itemA.mergeTargetIds = itemB.original_ids;
            
            itemB.suggestMerge = true;
            itemB.mergeTargetName = nameA;
            itemB.mergeTargetIds = itemA.original_ids;
          }
        }
      }
    }
  };

  const groups = [];
  const order = ['鱼鲜肉蛋', '生鲜蔬果', '粮油配料', '其他'];
  
  const titleKeyMap = {
    '鱼鲜肉蛋': 'cat_seafood_meat_eggs',
    '生鲜蔬果': 'cat_fresh_produce',
    '粮油配料': 'cat_grains_oils_condiments',
    '其他': 'cat_others'
  };

  order.forEach(cat => {
    if (categoryMap[cat].length > 0 || cat === '其他') {
      const mergedItems = mergeItems(categoryMap[cat]);
      applySuggestMerge(mergedItems);
      
      if (mergedItems.length > 0 || cat === '其他') {
        groups.push({
          title: cat,
          titleKey: titleKeyMap[cat],
          items: mergedItems,
          isOther: cat === '其他'
        });
      }
    }
  });

  return groups;
}

module.exports = {
  derivePlanningView,
  deriveExecutionView
};
