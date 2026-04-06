// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const realOpenId = wxContext.OPENID; // 必须从云端上下文中安全获取真实身份，防伪造
  const { anonymousOpenId, userInfo } = event;
  
  if (!anonymousOpenId || !realOpenId) {
    return { success: false, error: 'Missing openid parameters or invalid auth context' };
  }

  try {
    // 1. 检查或创建正式用户档案
    const { data: users } = await db.collection('users').where({ _openid: realOpenId }).get();
    if (users.length === 0) {
      await db.collection('users').add({
        data: {
          _openid: realOpenId,
          avatarUrl: userInfo?.avatarUrl || '',
          nickName: userInfo?.nickName || '',
          nationality: userInfo?.nationality || '',
          language: userInfo?.language || 'zh',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    } else if (userInfo) {
      await db.collection('users').doc(users[0]._id).update({
        data: {
          avatarUrl: userInfo.avatarUrl || users[0].avatarUrl,
          nickName: userInfo.nickName || users[0].nickName,
          nationality: userInfo.nationality || users[0].nationality,
          language: userInfo.language || users[0].language,
          updatedAt: db.serverDate()
        }
      });
    }

    // 2. 数据迁移 (将 temp_ 集合中的旧数据迁移至正式集合)
    const collectionsToMigrate = [
      { temp: 'temp_shopping_lists', formal: 'shopping_lists' },
      { temp: 'temp_histories', formal: 'histories' },
      { temp: 'temp_recipes', formal: 'recipes' }
    ];

    let migratedCount = 0;

    for (const col of collectionsToMigrate) {
      let skip = 0;
      const MAX_LIMIT = 100;
      let hasMore = true;

      while (hasMore) {
        // 循环分页获取，突破 100 条限制
        const { data: oldData } = await db.collection(col.temp)
          .where({ _openid: anonymousOpenId })
          .skip(skip)
          .limit(MAX_LIMIT)
          .get();
        
        if (oldData && oldData.length > 0) {
          // 构造新数据并修改归属
          const newRecords = oldData.map(item => {
            const newItem = { ...item };
            delete newItem._id; 
            newItem._openid = realOpenId;
            newItem.updatedAt = db.serverDate();
            return newItem;
          });

          // 云端批量插入，提升性能并保证原子性
          await db.collection(col.formal).add({ data: newRecords });
          
          migratedCount += oldData.length;
          skip += MAX_LIMIT;
        } else {
          hasMore = false;
        }
      }

      // 批量条件删除旧数据，避免 map 循环导致的超时或非一致性
      if (migratedCount > 0) {
         await db.collection(col.temp).where({ _openid: anonymousOpenId }).remove();
      }
    }

    return { success: true, migratedCount };
  } catch (err) {
    console.error('Migration error:', err);
    return { success: false, error: err.message };
  }
}
