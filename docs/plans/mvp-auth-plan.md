# 识为鲜 MVP 阶段账号体系演进规划 (纯微信原生 & 强登录拦截版)

本规划旨在 MVP 阶段（基于微信云开发）落地一套 **完整、规范、合规的微信原生账号与登录体系**。
**核心原则**：
1. **强登录拦截（无游客态）**：不登录无法使用正式服务，保留现有的 Onboarding 强制引导流程。
2. 放弃账号密码双轨制，专注微信原生登录体系。
3. **与 `db-restructure-plan.md` 深度协调**：所有对 `users` 的改造必须严格遵循 V2 数据结构。
4. **步步可验收**：每一个阶段都配备明确的、可独立验证的验收标准。

---

## 阶段一：微信开放平台绑定与数据模型扩展 (DB & Foundation)

**与 DB V2 协调点**：
在 `db-restructure-plan.md` 的 `3.1 users (用户信息表)` 基础上进行字段扩展。由于去除了游客态，不再需要复杂的数据合并逻辑（`mergeAnonData` 云函数作废）。

**执行步骤**：
1. **产品前置**：在微信开放平台注册并绑定当前小程序（获取 `UnionID` 前提）。
2. **扩展 `users` Schema**：
   新增 `unionid`（多端主键）和 `status`（账号状态，如 `active`、`deleted`）。

**✅ 阶段一验收标准**：
- [ ] 微信开放平台绑定完成。

---

## 阶段二：云函数鉴权层规范化 (Cloud Functions)

**与 DB V2 协调点**：
新用户授权注册时，初始化的 `users` 记录必须包含 V2 规范中的 `nationality` 和 `language` 默认值，并使用 `createdAt` / `updatedAt`（ServerDate）。

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

**执行步骤**：
1. **状态持久化重构**：
   - 彻底废除 `generateAnonymousId` 逻辑。
   - 初始化时，如果没登录（即没有真实的 OpenID），不再分配匿名 ID。
2. **实现真实的 Logout 与账户注销**：
   - **退出登录 (Logout)**：点击退出时，清空 `pf_user_id`、`pf_auth_source`、`userInfo` 等所有本地业务缓存。
   - 清除 `has_onboarded` 标识。
   - `wx.reLaunch` 跳转回 Onboarding 页面（重新进行强拦截）。
   - **注销账号 (Delete Account)**：调用云函数软删除 `users` 表记录并清理业务数据，随后执行 Logout 逻辑。

**✅ 阶段三验收标准**：
- [ ] 在“我的”页面点击“退出登录”，本地所有缓存被清空，并立刻被强制拦截回 Onboarding 授权页，无法直接看到首页。

---

## 阶段四：UI 界面与 Onboarding 流程优化 (UI & Routing)

**执行步骤**：
1. **保留并优化强阻断的 Onboarding**：
   - 保持 `index/index.js` 里的 `has_onboarded` 强制拦截逻辑，确保未登录用户必须先过授权关。
   - 将静默的 `login` 调用，改为在用户点击“开启体验”（授权完成）时明确触发。
2. **合规性优化（解绑非必要权限）**：
   - 尽管强制登录，但为了符合应用商店合规要求，**麦克风权限**和**位置权限**必须从 Onboarding 页面剥离。
   - Onboarding 页面仅收集“头像、昵称”以及触发微信静默登录获取 OpenID/UnionID。
   - 麦克风权限移至用户第一次点击“语音输入”时索要；位置权限移至触发“周边推荐”时索要。

**✅ 阶段四验收标准**：
- [ ] **强阻断体验**：清除缓存后扫码进入，立刻进入 Onboarding 页面。不点完成，绝对无法进入首页识物。
- [ ] **合规权限分离**：在 Onboarding 授权过程中，系统**不再**弹出索要麦克风和地理位置的系统级授权弹窗。
