# 《知食角》视频做法检索功能开发计划 (M16)

> **目标**：在不违规爬取、低成本的前提下，为用户在选定菜谱后，提供 B站的真实视频做法链接，完成从“识材 -> 决定做什么 -> 怎么做”的核心业务闭环。

***

## 一、 整体技术方案概述

由于微信小程序的平台限制（无法直接内嵌外链）以及 B站的反爬机制，我们采用\*\*“云端搜索引擎聚合方案”\*\*。

1. **搜索引擎**：接入 [Bocha (博查) Web Search API](https://open.bochaai.com/)，利用其针对国内环境优化的搜索能力，配合 `site:` 语法实现垂直站点的精准检索。
2. **云函数中转**：小程序前端不直接调用外部 API（防止密钥泄露），而是将菜名发给云函数，由云函数请求 Bocha API，清洗数据后返回统一的 JSON 结构。
3. **前端展示**：采用“懒加载（用户主动点击触发）”模式，在结果页或采购单页通过 Bottom Sheet（底部半屏弹窗）展示结果（视频标题和缩略图），点击卡片后复制链接并引导打开对应 App。

***

## 二、 阶段拆解与任务清单

### 阶段一：云函数搜索服务搭建 (Backend)

**目标**：在 `cloudfunctions/analyze` 中新增一个 Action，能够接收关键词并返回 B站的搜索结果。

**任务清单**：

1. **API 密钥配置**：
   - 使用 Bocha (博查) API 密钥：`sk-118c4eb421804e86bf997d383584b387`。
   - 在微信云开发控制台，为 `analyze` 云函数添加环境变量 `BOCHA_API_KEY`（值为上述密钥）。
2. **编写搜索服务逻辑**：
   - 修改 `cloudfunctions/analyze/index.js`，增加 `action === 'search_tutorial'` 的分支。
   - 编写 `fetchTutorials(keyword)` 函数，使用 `axios` 向 Bocha API 发起请求：
     - 请求：`query="{keyword} 做法 site:bilibili.com"` (注意 Bocha 的具体参数名)
   - **数据清洗与格式化**：解析 Bocha 返回的网页列表（如 `data.webPages.value`），提取标题（Title）、链接（URL）、视频缩略图（Thumbnail）和来源（Source）。
3. **Mock 数据准备**：
   - 为本地开发（无网络或无 API 密钥时）准备一套结构化的 Mock 数据。
4. **单元测试与部署**：
   - 本地测试云函数逻辑，确保返回结构符合预期。
   - 部署更新 `analyze` 云函数。

**验收标准**：

- 小程序端调用云函数 `analyze`，传入 `action: 'search_tutorial'` 和 `keyword: '红烧肉'`，能稳定返回包含 B站链接及缩略图的 JSON 数组（至少 10条数据）。
- 搜索结果和选定的食材做法相关性高

***

### 阶段二：小程序前端交互实现 (Frontend)

**目标**：在小程序界面中提供获取做法的入口，优雅地展示搜索结果（含缩略图），并完成一键复制的闭环交互。

**任务清单**：

1. **增加交互入口**：
   - 在结果页（`pages/result`）的每个菜谱卡片下方，或采购单页（`pages/list`）显著位置，新增按钮：`[ 📺 搜 B站 做法 ]`。
2. **开发底部弹窗组件 (Bottom Sheet)**：
   - 使用微信原生组件或自定义 View，实现一个从底部弹出的半屏面板。
   - 面板展示“B站推荐”区块。
   - 弹窗内支持 Loading 态（骨架屏或 Loading Icon）和 Error 态（重试按钮）。
3. **结果卡片渲染**：
   - 设计简洁的内容卡片，包含视频缩略图、平台 Icon、内容标题和短链接展示。
4. **一键复制与引导**：
   - 为卡片绑定点击事件，调用 `wx.setClipboardData` 复制对应的 URL。
   - 复制成功后，弹出友好的 Toast 提示：“链接已复制，请打开 \[B站] 观看”。
5. **多语言适配 (i18n)**：
   - 按钮文案、加载提示、弹窗标题、Toast 提示等需接入现有的 `en.js` 和 `zh.js` 语言包。

**验收标准**：

- 用户点击按钮，按钮变为加载状态。
- 弹窗正常升起，展示 B站的做法卡片（带缩略图）。
- 点击卡片，成功复制链接并弹出正确的 Toast 提示。
- 英文模式下，所有新增文案均正确显示为英文。

***

### 阶段三：PRD 更新与全链路自测 (Integration)

**目标**：确保新功能与现有核心链路完美融合，文档同步更新。

**任务清单**：

1. **更新文档**：
   - 将“视频做法检索”功能补充到 `docs/prd/mvp-prd.md` 的功能范围和页面流转图中。
   - 更新 `docs/api/api.md`，补充 `search_tutorial` 的接口定义。
2. **全链路回归测试**：
   - 从拍照/上传 -> 识别结果 -> 鲜度判断 -> 选定菜谱 -> **点击搜做法弹窗** -> 生成采购单。
   - 检查断网、API 调用失败等异常场景下的兜底逻辑（是否正常展示 Mock 数据或错误提示，不能导致整个页面崩溃）。

**验收标准**：

- 文档与实际代码一致。
- 核心闭环顺畅，新功能作为“增强体验”存在，即使搜索失败也不影响主流程（选菜、生成采购单）的进行。

***

## 三、 数据结构契约 (API Schema)

### 请求 (Request)

```json
{
  "action": "search_tutorial",
  "keyword": "红烧肉",
  "lang": "zh" // 用于返回不同语言的错误提示或过滤逻辑
}
```

### 响应 (Response)

```json
{
  "error": false,
  "data": {
    "bilibili": [
      {
        "title": "王刚：【红烧肉】的家常做法，软糯香甜肥而不腻",
        "url": "https://www.bilibili.com/video/BV1xx411c7mD/",
        "thumbnail": "https://i1.hdslb.com/bfs/archive/xxxxxx.jpg",
        "source": "bilibili"
      },
      {
        "title": "厨师长教你：“红烧肉”的正宗做法",
        "url": "https://www.bilibili.com/video/BV1sx411m7mX/",
        "thumbnail": "https://i2.hdslb.com/bfs/archive/yyyyyy.jpg",
        "source": "bilibili"
      }
    ]
  }
}
```

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

