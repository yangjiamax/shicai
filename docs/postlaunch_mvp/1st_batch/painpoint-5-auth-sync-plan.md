# 痛点五：鉴权滞后与乐观更新优化计划 (Auth Sync & Optimistic UI Plan)

## 1. 背景与目标
在小程序冷启动或杀后台重开时，部分页面（如“我的”和“购物清单”页）由于未能正确等待全局鉴权锁，导致在云端静默登录（`login` 云函数）尚未完成时，页面就以空身份或游客身份拉取数据，进而误判用户为游客，弹出“请开启云服务”等体验阻断提示。
同时，用户在修改头像或昵称时，前端强行阻塞等待云端上传和数据库写入，导致肉眼可见的明显延迟。
**本计划目标**：彻底解决冷启动鉴权竞态问题，实现无缝平滑的状态恢复；并引入 Optimistic UI（乐观更新）策略，让资料修改实现“秒切”。

---

## 2. 逻辑溯源与影响面评估

### 2.1 现有的逻辑是怎么跑的？ (Context First)
1. **全局登录**：`app.js` 在 `onLaunch` 时调用 `initAuth()`，发起云函数静默登录，并将 Promise 挂载到 `app.authReadyPromise`。
2. **首页（正常）**：`pages/index/index.js` 的 `onLoad` 和 `onShow` 中均写了 `if (app.authReadyPromise) await app.authReadyPromise;`，所以首页能正常阻塞等待真实身份。
3. **“我的”页与“清单”页（漏锁）**：`pages/my/index.js` 和 `pages/list/index.js` 的 `onShow` 中**遗漏了对该 Promise 的等待**。它们直接同步读取 `app.globalData.authSource`，此时云函数还在飞，读到的是空值或旧缓存，导致误判为 `anonymous`（游客），从而触发 UI 渲染错误（如显示“请开启云服务以保存历史”）。
4. **资料更新阻塞**：在 `pages/my/index.js` 的 `onChooseAvatar` 和 `saveNickname` 中，代码使用了 `wx.showLoading` 锁死屏幕，必须等待 `wx.cloud.uploadFile` 和 `db.collection('users').update` 全部成功后，才调用 `this.setData` 刷新界面，耗时可达 1~3 秒。

### 2.2 影响面与兼容性评估 (Blast Radius)
- **输入输出守恒 (I/O Consistency)**：不改变任何云函数的入参和出参，不改变数据库 `users` 集合的结构。完全是前端时序的控制。
- **兼容性保障 (Backward Compatibility)**：老用户的 `authReadyPromise` 依然会走缓存恢复逻辑，加上锁后只会让页面等待几百毫秒的骨架屏/白屏，不会引发死锁。
- **爆炸半径**：仅涉及 `pages/my/index.js` 和 `pages/list/index.js` 的 `onShow` 增加 `await` 锁，以及 `pages/my/index.js` 资料修改的异步化改造。风险极低，收益极大。

---

## 3. 实现方案 (Implementation Plan)

### 3.1 方案一：补齐全局鉴权锁（解决状态滞后与误弹提示）
- **核心逻辑**：所有直接依赖用户身份拉取数据的 Tab 页面，必须在 `onShow` 的第一行拦截并等待鉴权完成。
- **改动点**：
  1. `pages/my/index.js` 的 `onShow` 顶部加入：
     ```javascript
     if (app.authReadyPromise) {
       await app.authReadyPromise;
     }
     ```
  2. `pages/list/index.js` 的 `onShow` 顶部加入同样的鉴权锁，确保生成的清单不会被错误地归属到 `anonymous` 名下。
  3. `pages/recipe/index.js`（菜谱详情页）若存在从分享卡片直接打开的场景，其 `onLoad`/`onShow` 也应补充鉴权锁，防止点亮红心（收藏）时身份错乱。

### 3.2 方案二：引入 Optimistic UI 乐观更新（解决资料修改滞后）
- **核心逻辑**：修改资料时，**先改本地缓存和 UI 渲染，后在后台静默同步云端**。如果云端同步失败，再通过 Toast 提示或重置为旧状态（或者仅提示即可，因为本地可用）。
- **改动点**：
  1. **头像修改 (`onChooseAvatar`)**：
     - 去除 `wx.showLoading`。
     - 拿到 `tempAvatarUrl` 后，立刻 `this.setData({ 'userInfo.avatar': tempAvatarUrl })` 并 `wx.setStorageSync`。
     - 异步发起 `wx.cloud.uploadFile`，拿到 `fileID` 后，再静默写入数据库（`users` 表），并更新本地存储中的 `fileID` 替换临时路径。
  2. **昵称修改 (`saveNickname`)**：
     - 去除 `wx.showLoading`。
     - 立刻 `this.setData` 并在本地 `wx.setStorageSync`。
     - 异步调用 `this.saveUserInfoToCloud()`。
     - 去除 `wx.showToast({ title: app.t('my_save_nickname_success') })`（提交即生效，无需打扰用户，符合避免重复提示的原则）。

---

## 4. 验收标准 (Acceptance Criteria)

1. **冷启动模拟验收（不闪弹窗）**：
   - 清理全部缓存，重新编译登录。然后杀掉微信后台（真机）或 IDE 重新编译（热启动/冷启动交替）。
   - 快速点击底部“我的” Tab 或“购物清单” Tab，页面应当保持骨架屏或白屏几百毫秒，直到左上角头像渲染出真实数据或清单拉取完成，**期间绝对不出现“请开启云服务以保存历史”等误判 UI**。
2. **资料秒切验收（0.1s 响应）**：
   - 在“我的”页面，点击头像更换。
   - 页面不出现 loading 遮罩，头像在 0.1s 内肉眼可见地变为新头像。即使在 Network Throttling 模拟弱网环境下，依然能瞬间完成视觉切换，后台默默上传不阻塞主线程。
3. **静默失败兜底验收**：
   - 若在弱网下上传头像失败，能在后台抛出异常并使用临时路径兜底，确保当次访问依然能看到自己选的头像。