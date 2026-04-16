# 痛点八优化计划：识物结果容错与手动纠偏机制 (Edit Ingredient Name)

## 1. 背景与目标
**背景**：目前大模型（极速认物环节）并非 100% 准确。当 AI 识别错误时，用户只能无奈接受或重新拍照，缺乏干预手段。这导致错误的食材名称会被带入后续的“购物清单”和“食谱详情”中，严重影响数据准确性与用户体验。
**目标**：在识物结果页引入“手动纠偏机制”（编辑按钮与弹窗），允许用户修改 AI 识别出的主食材名称。修改后的名称将无缝接入现有的业务流，确保落库和流转的数据完全正确。

## 2. 逻辑溯源与影响面评估（Context First & I/O Consistency）

在执行代码修改前，严格遵循《后上线时代代码演进法则》，评估如下：

*   **当前逻辑溯源**：
    *   主食材名称最初由 `analyzeUtil.analyzeIdentify` 获取，存储于 `pages/result/index.js` 的 `this.data.result.ingredientName` 中。
    *   页面渲染依赖 `<text class="ingredient-name">{{result.ingredientName}}</text>`。
    *   **加入清单流向**：`generateList()` 方法读取 `this.data.result.ingredientName` 作为主食材写入云端 active 清单。
    *   **查看食谱流向**：`viewRecipe()` 方法读取 `this.data.result.ingredientName` 并通过 URL 参数传递给 `pages/recipe/index`。
*   **修改方案与 I/O 守恒**：
    *   新增的编辑操作**仅修改**本地状态 `this.data.result.ingredientName`，不改变任何数据结构（如不改变对象层级，不删减其他属性）。
    *   原有的 `generateList` 和 `viewRecipe` 逻辑完全**不需要修改**，它们天然会读取被用户更新后的新名称。
    *   为遵循“最小侵入原则”，修改名称后**不会**自动重新触发百科/菜谱的云函数请求（避免浪费 token 与用户等待时间），重点解决“落库标签错误”的核心痛点。
*   **爆炸半径**：
    *   极小。改动仅限于 `pages/result/index` 的 UI 渲染和本地变量赋值。兼容已有缓存与历史数据。

## 3. 小步快跑落地方案

**步骤一：UI 视图改造 (pages/result/index.wxml & wxss)**
1.  在食材名称 `<text class="ingredient-name">` 旁边增加一个编辑图标（铅笔 Icon），绑定点击事件 `bindtap="openEditModal"`。
2.  在页面底部新增一个类似于现有的 Custom Modal 的“编辑食材名称”弹窗（包含 Input 输入框、取消、保存按钮）。

**步骤二：交互与状态管理 (pages/result/index.js)**
1.  新增状态变量：`showEditModal: false`, `editTempName: ''`。
2.  新增方法 `openEditModal()`：将当前的 `result.ingredientName` 赋值给 `editTempName`，并打开弹窗。
3.  新增方法 `onEditNameInput(e)`：双向绑定输入框的值。
4.  新增方法 `saveEditName()`：校验非空后，执行 `this.setData({ 'result.ingredientName': this.data.editTempName, showEditModal: false })`。

**步骤三：多语言文案补充 (utils/i18n.js 或相关云配置)**
1.  需要在多语言配置中补充弹窗所需的文案：
    *   `res_edit_name_title` (修改食材名称)
    *   `res_edit_name_placeholder` (请输入正确的名称)
    *   `res_btn_save` (保存)
    *   `res_btn_cancel` (取消)

## 4. 验收标准（验证路径）

1.  **UI 呈现验收**：进入识图结果页，确认食材名称右侧出现清晰可点击的编辑（铅笔）图标。
2.  **交互修改验收**：点击编辑图标，弹出修改弹窗，输入框内默认填充当前的错误名称。修改内容并点击保存，弹窗关闭，页面上的食材名称**立即更新**为新名称。
3.  **数据流转验收（加入清单）**：点击底部的“加入清单”按钮，去“我的 - 购物清单”中查看，确认加入的是**修改后**的正确名称。
4.  **数据流转验收（查看食谱）**：点击“查看食谱详情”，确认跳转后页面顶部的主食材参数使用的是**修改后**的正确名称。

---
*请在确认本计划及评估无误后，回复“确认执行”，我将开始编写并应用具体代码。*