# 痛点七：转化漏斗断层与数据统计优化方案 (Funnel & Tracking Optimization Plan)

## 1. 逻辑溯源与当前架构分析 (Context First)

**当前登录与注册链路（I/O 分析）：**
- **Input**: 用户冷启动打开小程序。
- **Process**:
  1. `auth.js` 自动调用 `login` 云函数获取底层的 `OPENID`。
  2. `auth.js` 拿着这个 `OPENID` 去查云数据库的 `users` 集合。
  3. **【核心断层点】** 如果查不到，则在本地将用户标记为 `anonymous`（游客身份），**此时绝对不会向 `users` 集合写入任何数据**。
  4. 游客产生的业务数据全部路由至平行的 `temp_shopping_lists`、`temp_histories` 等临时集合中。
  5. 只有当用户触发高价值行为（如收藏食谱被拦截），或主动进入“我的-编辑资料”完成 Onboarding 表单（填写头像、昵称）后，前端才会调用 `migrateUserData` 云函数或执行 `db.update`，**此时才真正在 `users` 集合中生成档案**。
- **Output**: 
  - 微信官方分析平台（基于底层网络握手）录得 60+ UV。
  - `users` 集合（基于业务表单落库）仅有不到 10 条数据。中间的 50+ 用户属于“访问了但没走完 Onboarding”的流失游客。

## 2. 爆炸半径与影响面评估 (Blast Radius)

本次改动的核心是将“记录用户访问轨迹”与“收集用户业务资料”彻底解耦。

- **影响范围**：
  - `cloudfunctions/login/index.js`：将增加轻量级的数据库读写操作（静默落库）。
  - `miniprogram/utils/auth.js`：身份判定逻辑将从“库里有没有文档”变为“库里文档的 `role` 字段是什么”。
  - `cloudfunctions/migrateUserData/index.js` & `pages/onboarding/index.js`：需在用户填完资料后，显式将其状态扭转为正式用户。
- **输入输出守恒 (I/O Consistency)**：
  - `login` 云函数的返回值（`openid`, `appid`, `unionid`）必须保持原样，严禁修改或增删，防止破坏现有 Auth 链路。
  - `auth.js` 对外暴露的 `initAuth` 接口返回值和全局状态维护机制不变。

## 3. 老数据与缓存兼容策略 (Backward Compatibility)

- **兼容旧的 `users` 数据（防死锁）**：
  之前已经注册的老用户文档中，并没有 `role` 这个字段。因此在 `auth.js` 判断身份时，必须兼容判断：
  `const isFormal = userData.role === 'onboarded' || (userData.nickName && userData.avatarUrl);`
  只要有头像和昵称，就认定为正式老用户，无缝衔接，不需要他们重新走 Onboarding。
- **避免重复覆盖（幂等性）**：
  `login` 云函数中的静默落库必须使用 `upsert` 逻辑（先查后写）。如果文档已存在（不管是游客还是老用户），仅更新 `lastLoginAt`，绝不能覆盖老用户辛辛苦苦填写的业务资料。

## 4. 最小侵入落地方案 (Implementation Steps)

### 步骤 1：云端前置静默影子账户 (`cloudfunctions/login/index.js`)
在返回 `OPENID` 之前，引入云数据库实例：
- 根据 `OPENID` 查询 `users` 集合。
- **不存在**：新增基础文档 `{ _openid, role: 'visitor', createdAt: db.serverDate(), lastLoginAt: db.serverDate() }`。
- **已存在**：更新文档 `{ lastLoginAt: db.serverDate() }`。

### 步骤 2：客户端状态机分级 (`miniprogram/utils/auth.js`)
修改 `initAuth` 中的查询结果判断逻辑：
- 拿到 `users` 集合的数据后，评估 `isFormal = userData.role === 'onboarded' || (userData.nickName && userData.avatarUrl)`。
- **如果 `isFormal` 为 true**：执行原有的正式用户逻辑，本地标记为 `cloud_openid`，恢复业务缓存。
- **如果 `isFormal` 为 false**：说明只是通过静默落库生成的影子游客。继续执行原有的 `anonymous` 降级逻辑，让他们继续使用 `temp_` 临时集合，不阻断核心体验。

### 步骤 3：Onboarding 状态扭转闭环
在用户真正完成资料填写时，补齐状态机拼图：
- 修改 `cloudfunctions/migrateUserData/index.js`：在更新/创建用户文档时，追加写入 `role: 'onboarded'`。
- 修改 `pages/onboarding/index.js`：在老用户修改资料的 update 逻辑中，追加写入 `role: 'onboarded'`。

### 步骤 4：转化漏斗自定义埋点 (Tracking)
为了精准定位那 50 多个游客到底在哪一步流失，利用 `wx.reportEvent` 埋点关键节点：
- **`App_Launch`**：在 `app.js` 的 `onLaunch` 中调用。
- **`Login_Success`**：在 `auth.js` 静默获取 OpenID 成功后调用。
- **`Onboarding_Show`**：在 `pages/onboarding/index.js` 的 `onShow` 中调用。
- **`Onboarding_Complete`**：在 `pages/onboarding/index.js` 资料保存并扭转身份成功后调用。
*(注：后续需在微信公众平台后台 - 统计 - 自定义分析中，提前配置这 4 个事件的 eventID)*

---
**验收标准**：
1. **静默建档**：清空缓存后新开小程序，不填任何资料，直接查看云数据库 `users` 集合，应能看到一条 `role: 'visitor'` 的新文档。
2. **体验无损**：该新用户依然能正常拍照、生成清单（数据落入 `temp_shopping_lists`），不会被强制拦截。
3. **状态扭转**：该用户点击收藏食谱，被引导去填写资料，保存后，其 `users` 文档的 `role` 变为 `onboarded`，且原 `temp_` 数据成功迁移。
4. **老号兼容**：直接给数据库里某个老用户去掉 `role` 字段，重启小程序，不应弹授权框，依然能正常识别为正式用户。