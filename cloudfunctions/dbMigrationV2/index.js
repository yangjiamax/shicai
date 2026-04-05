// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  console.log('Migration started...')
  const results = {
    shoppingListsUpdated: 0,
    historiesUpdated: 0,
    errors: []
  }

  try {
    // 任务 A：购物清单内嵌化
    console.log('--- 开始任务 A：购物清单内嵌化 ---')
    const MAX_LIMIT = 100
    // 获取所有购物清单
    const listCountResult = await db.collection('shopping_lists').count()
    const listTotal = listCountResult.total
    const listBatchTimes = Math.ceil(listTotal / 100)
    
    for (let i = 0; i < listBatchTimes; i++) {
      const { data: lists } = await db.collection('shopping_lists').orderBy('_id', 'asc').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
      
      for (const list of lists) {
        // 如果已经有 items，可能已经迁移过，跳过
        if (list.items && !list.created_at) {
          continue
        }

        try {
          // 查询对应的 ingredients
          const { data: ingredients } = await db.collection('ingredients').where({
            list_id: list._id
          }).limit(1000).get()

          // 转化为 items 数组
          const items = ingredients.map(ing => {
            let itemCreatedAt = ing.add_time
            if (typeof itemCreatedAt === 'string') {
              itemCreatedAt = new Date(itemCreatedAt)
            } else if (!itemCreatedAt) {
              itemCreatedAt = new Date()
            }

            return {
              id: ing._id,
              name: ing.name,
              standardName: ing.standard_name || ing.standardName || '',
              category: ing.category || '',
              sourceRecipe: ing.source_recipe || ing.sourceRecipe || '',
              status: ing.status || 'pending',
              createdAt: itemCreatedAt
            }
          })

          let listCreatedAt = list.created_at || list.createdAt
          if (typeof listCreatedAt === 'string') {
            listCreatedAt = new Date(listCreatedAt)
          } else if (!listCreatedAt) {
            listCreatedAt = new Date()
          }

          // 更新 shopping_lists
          await db.collection('shopping_lists').doc(list._id).update({
            data: {
              items: items,
              createdAt: listCreatedAt,
              updatedAt: list.updatedAt || new Date(),
              created_at: _.remove()
            }
          })
          results.shoppingListsUpdated++
        } catch (err) {
          console.error(`更新清单 ${list._id} 失败`, err)
          results.errors.push(`List ${list._id}: ${err.message}`)
        }
      }
    }

    // 任务 B：集邮册结构升级
    console.log('--- 开始任务 B：集邮册结构升级 ---')
    const historyCountResult = await db.collection('histories').count()
    const historyTotal = historyCountResult.total
    const historyBatchTimes = Math.ceil(historyTotal / 100)

    for (let i = 0; i < historyBatchTimes; i++) {
      const { data: histories } = await db.collection('histories').orderBy('_id', 'asc').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()

      for (const history of histories) {
        // 如果已经有 sourceType 且有 ingredientName，说明已经完全迁移过，跳过
        if (history.sourceType && history.ingredientName !== undefined) {
          continue
        }

        try {
          const updateData = {
            sourceType: history.sourceType || 'vision',
            updatedAt: history.updatedAt || new Date()
          }

          if (history.ingredient_name !== undefined) {
            updateData.ingredientName = history.ingredient_name
            updateData.ingredient_name = _.remove()
          } else if (history.analysisResult && history.analysisResult.ingredient_name) {
            // 兼容非常早期的记录：根节点没有 ingredient_name，只有 analysisResult 里有
            updateData.ingredientName = history.analysisResult.ingredient_name
          }

          if (history.selected_recipe !== undefined) {
            updateData.selectedRecipe = history.selected_recipe
            updateData.selected_recipe = _.remove()
          }

          await db.collection('histories').doc(history._id).update({
            data: updateData
          })
          results.historiesUpdated++
        } catch (err) {
          console.error(`更新集邮册 ${history._id} 失败`, err)
          results.errors.push(`History ${history._id}: ${err.message}`)
        }
      }
    }

    console.log('Migration finished:', results)
    return {
      success: true,
      results
    }
  } catch (err) {
    console.error('Migration failed:', err)
    return {
      success: false,
      error: err.message,
      results
    }
  }
}