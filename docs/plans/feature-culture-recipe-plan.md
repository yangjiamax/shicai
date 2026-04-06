# “跨文化饮食体验”功能 MVP 落地计划

## 一、 背景与目标

在旅游场景下，用户使用 App 扫描未知食材时，不仅需要基础的科普，还需要与当地产生链接。本功能旨在通过提供**“熟悉的滋味”**（基于用户国籍）和**“试试当地做法”**（基于用户当前地理位置），将产品从“实用工具”升级为“有温度的探索服务”。

## 二、 核心改动点

### 1. 资料完善与阻断机制 (Profile & Nationality)
- **页面改造**：在 `pages/my/index` 增加“国籍 / Nationality”选择器。
- **强制阻断**：在 `pages/index/index` 拍照/相册入口处检查，若未设置国籍，强制跳转至“我的”页面。
- **数据存储**：**一次性输入，永久保存，后续用户可在“我的”页面随时修改**。优先存入本地缓存 `StorageSync('userNationality')`，后续可按需同步云端。

### 2. 用户所在地获取 (Location)
- **权限配置**：`app.json` 中配置 `permission` 声明 `wx.getLocation` 权限用途。
- **静默获取**：在发起分析前调用，获取 `latitude` 和 `longitude`。
- **缺省方案**：设 3 秒超时，若拒绝授权或获取失败，经纬度传 `null`，不阻断核心流程。

### 3. 大模型 Prompt 升级 (AI Logic)
- **参数传递**：`analyze` 云函数接收入参 `nationality` 和 `location: {lat, lng}`。
- **Prompt 约束**：
  - **熟悉的滋味**：要求 AI 结合用户的 `nationality` (国籍)，推荐该国家针对该食材最熟悉、最家常的做法。
  - **当地的做法**：要求 AI 根据 `location` (经纬度) 推断所在地区，并推荐当地特色做法。强调“符合普通家庭条件，仅需常规厨具，无需具体步骤”。
- **输出结构调整**：将 `recipes` 从数组重构为对象：
  ```json
  "recipes": {
    "familiar": [ {"recipe_name": "...", "ingredients_needed": []} ],
    "local": [ {"recipe_name": "...", "ingredients_needed": []} ]
  }
  ```

### 4. 视觉与交互改造 (UI/UX)
- **Tab 切换组件**：在 `pages/result/index` 的推荐做法区域，引入双 Tab 设计（[🍴 熟悉的滋味] / [📍 试试当地做法]）。
- **向下兼容**：若 `local` 数据为空（无定位或AI未生成），或读取旧历史记录（`recipes` 为数组），则隐藏 Tab 栏，平铺展示菜谱，确保不报错。

---

## 三、 实施步骤 (Phases)

### Phase 1: 基础配置与国际化字典
- 修改 `app.json` 增加 `permission` 地理位置声明。
- 更新 `utils/zh.js` 和 `utils/en.js`，增加国籍列表、Tab 标题、阻断提示等词条。

### Phase 2: “我的”页面改造（国籍选择）
- 修改 `pages/my/index.wxml/js/wxss`，增加国籍 Picker。
- 实现本地缓存 `userNationality` 的读取和保存。

### Phase 3: 首页改造（阻断逻辑与定位获取）
- 修改 `pages/index/index.js`，在 `handleCamera` / `handleAlbum` 中加入国籍检查与跳转逻辑。
- 增加 `wx.getLocation` 逻辑（带超时保护），将定位和国籍信息传递给 `analyzeUtil`。

### Phase 4: 云函数及解析层升级
- 修改 `cloudfunctions/analyze/index.js`，更新中英文 Prompt，引入 `nationality` 和 `location` 变量。确保中英文模式下返回的数据结构完全一致。
- 修改 `miniprogram/utils/analyze.js`，适配新的嵌套 `recipes` 结构返回，并兼容旧结构。确保 `lang` 参数正确传递给云函数。
- **稳定性保障**：在解析大模型返回时，增加对新数据结构的健壮性校验（try-catch 和类型判断），若解析失败，提供稳健的兜底数据（Fallback），保证主流程绝对不崩溃。

### Phase 5: 结果页 UI 改造
- 修改 `pages/result/index.wxml/js/wxss`，实现 Tab 切换逻辑。
- 增加向下兼容逻辑，确保历史记录（以及本地缓存的旧数据）依然可用。
- **国际化同步**：确保新增的 UI 元素（Tab 标题、国籍选择器提示等）全部接入现有的 `i18n` 机制，支持中英文实时切换。

### Phase 6: 全局联调与稳定性验证
- **用例验证**：
  1. 首次使用未选择国籍，拍照被阻断并跳转至“我的”页面。
  2. 选择国籍后，重新拍照，正常进入结果页。
  3. 授权定位：结果页正常展示“熟悉的滋味”和“试试当地做法”双 Tab。
  4. 拒绝授权定位或断网：结果页仅展示“熟悉的滋味”平铺列表，不报错。
  5. 切换系统语言（中/英）：所有新增的提示、Tab 标题、选择器选项均能正确翻译。
  6. 打开旧的历史记录：完美兼容展示，不出现空白或报错。
