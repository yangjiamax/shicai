# 本地开发与部署（MVP）

## 1. 开发者工具导入

1. 打开微信开发者工具
2. 选择「导入项目」→ 选择本目录
3. AppID 可先用测试号或体验模式导入

## 2. 不启用云开发（纯 Demo）

- 直接运行即可走 Mock 数据，页面闭环可用
- 逻辑：小程序检测到 `wx.cloud` 不可用或调用失败时自动回退 Mock

## 3. 启用云开发（建议）

1. 在开发者工具内开通云开发环境（CloudBase）
2. 右键 `cloudfunctions/analyze` → 上传并部署：云端安装依赖
3. 运行小程序，拍照后将走云函数 `analyze`

## 4. 接入真实多模态模型（替换 mock）

改动位置：

- 云函数：[index.js](../cloudfunctions/analyze/index.js) 内的 `exports.main`

约定：

- 请求：接收 `imageBase64`
- 返回：严格按 [api.md](../api/api.md) 的结构返回 JSON
- Prompt：参考 [prompt.md](../api/prompt.md)

安全要求：

- 不在小程序端保存或硬编码任何密钥
- 供应商 Key 存在云端环境变量或安全配置中
