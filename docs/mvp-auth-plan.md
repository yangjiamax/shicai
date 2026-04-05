# 识为鲜 MVP 阶段账号体系演进规划 (纯微信原生 & DB V2 协调版)

本规划旨在 MVP 阶段（基于微信云开发）落地一套 **完整、规范、合规的微信原生账号与登录体系**。
**核心原则**：
1. 放弃账号密码双轨制，采用“游客态（匿名） + 微信授权态（正式账号）”。
2. **与 `db-restructure-plan.md` 深度协调**：所有对 `users` 及业务表的改造，必须严格遵循 V2 数据结构（小驼峰、内嵌数组、独立 `recipes` 集合）。
3. **步步可验收**：每一个阶段都配备明确的、可独立验证的验收标准。

---

## 阶段一：微信开放平台绑定与数据模型扩展 (DB & Foundation)

**与 DB V2 协调点**：
在 `db-restructure-plan.md` 的 `3.1 users (用户信息表)` 基础上进行字段扩展，并确保匿名数据合并时，同时覆盖 V2 架构下的 `shopping_lists`、`histories` 和 `recipes` 三个核心业务集合。

**执行步骤**：
1. **产品前置**：在微信开放平台注册并绑定当前小程序（获取 `UnionID` 前提）。
2. **扩展 `users` Schema**：
   新增 `unionid`（多端主键）和 `status`（账号状态，如 `active`、`deleted`）。
3. **开发数据合并云函数 `mergeAnonData`**：
   接收参数 `anonId`，将 `shopping_lists`、`histories`、`recipes`、`feedbacks` 集合中 `_openid === anonId` 的记录，批量更新为当前真实的微信 `OPENID`。

**✅ 阶段一验收标准**：
- [ ] 微信开放平台绑定完成。
- [ ] 编写并部署 `mergeAnonData` 云函数。传入测试 `anonId` 时，能成功将 V2 结构的四张业务表中的 `_openid` 更新为真实微信 OpenID，且数据结构不被破坏。

---

## 阶段二：云函数鉴权层规范化 (Cloud Functions)

**与 DB V2 协调点**：
新用户注册时，初始化的 `users` 记录必须包含 V2 规范中的 `nationality` 和 `language` 默认值，并使用 `createdAt` / `updatedAt`（ServerDate）。

**执行步骤**：
1. **重构 `login` 云函数**：
   - 调用 `cloud.getWXContext()` 获取 `OPENID` 和 `UNIONID`。
   - 查库：如果 `users` 集合不存在该 `OPENID`，则自动创建记录，包含：`_openid`, `unionid`, `nickName: '微信用户'`, `avatarUrl: ''`, `nationality: ''`, `language: 'zh'`, `status: 'active'`, `createdAt`, `updatedAt`。
   - 返回：`openid`, `unionid`, `user_id`（对应记录的 `_id`）。
2. **业务云函数防呆**：
   - 在 `analyze`、`extractList` 等云函数中，确保上下文 `OPENID` 不是空值或非法字符串。

**✅ 阶段二验收标准**：
- [ ] 在小程序端调用 `login` 云函数，能够成功返回 `openid`。
- [ ] 若为首次调用，云数据库 `users` 集合中会自动新增一条记录，且字段完全符合 V2 字典规范。
- [ ] 若已绑定开放平台，返回结果及数据库中必须包含合法的 `unionid`。

---

## 阶段三：客户端状态管理与真实登出 (`auth.js`)

**与 DB V2 协调点**：
登出时清理本地缓存，但不影响云端已经按照 V2 规范存储的用户偏好配置。下次登录时重新拉取云端配置。

**执行步骤**：
1. **状态持久化重构**：
   - 维护 `pf_auth_source` 状态：`anonymous`（游客） -> `cloud_openid`（正式）。
   - 初始化时，优先检查本地，若无则生成并存储 `anon_xxx` 作为 `pf_user_id`。
2. **实现真实的 Logout**：
   - 清空 `pf_user_id`、`pf_auth_source`、`userInfo` 等所有本地业务缓存。
   - 重新生成一个新的 `anon_xxx`，设为 `anonymous` 状态。
   - `wx.reLaunch` 跳转至首页。**绝不再静默调用 `login` 云函数**。

**✅ 阶段三验收标准**：
- [ ] 首次冷启动（未授权过），本地 `pf_user_id` 为 `anon_xxx`，`pf_auth_source` 为 `anonymous`。
- [ ] 在“我的”页面点击“退出登录”，本地所有 `pf_` 开头的缓存被清空，并立即生成一个新的 `anon_` ID，页面退回首页。

---

## 阶段四：UI 界面与“按需授权”重构 (UI & Routing)

**与 DB V2 协调点**：
彻底解耦“使用权”与“用户资料”，让用户在游客态下依然能生成 V2 结构的购物单和历史记录。

**执行步骤**：
1. **废弃强阻断的 Onboarding**：
   - 移除 `index/index.js` 里的 `has_onboarded` 强制拦截逻辑，游客直接进入首页拍照。
2. **按需触发登录 (Just-in-Time Login)**：
   - **“我的”页面**：游客态下顶部显示“未登录”，点击触发 `login` 流程。
   - **数据持久化操作**：在点击“❤️收藏食谱”（写入 `recipes`）、“加入我的账单”（写入 `shopping_lists`）时，若为游客，则弹窗提示“请先登录以永久保存数据”。
   - **登录并合并数据**：用户同意登录后，调用重构后的 `login` 云函数获取真实身份，随后立刻调用阶段一的 `mergeAnonData` 云函数，将刚刚游客态产生的数据归属到正式账号下。
3. **解绑权限索要**：
   - 麦克风/位置权限移至功能实际触发时请求，不再随登录环节索要。

**✅ 阶段四验收标准**：
- [ ] **无阻断体验**：清除全部缓存后扫码进入，无任何弹窗，可直接拍照并查看识别结果。
- [ ] **按需登录与数据合并**：在游客态下拍了一张照片（产生了匿名的 `histories`）。点击“收藏”时，弹出登录提示；登录成功后，刷新云数据库，该条 `histories` 的 `_openid` 成功变成了真实的微信 OpenID。
- [ ] **权限解绑**：登录过程中系统未索要麦克风和地理位置权限。
