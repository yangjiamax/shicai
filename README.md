# 知食角小程序（MVP）

目标：跑通「拍照/上传 → 识别 → 鲜度 → 做法 → 佐料采购单」闭环的可演示版本。

## 目录结构

- miniprogram/：小程序端
- cloudfunctions/：云函数（可选，用于对接多模态模型）
- docs/：MVP PRD、接口与 Prompt 约定

## 快速开始

1. 打开微信开发者工具，导入本目录
2. 若启用云开发：在工具内开通云开发环境，并上传部署 cloudfunctions/analyze
3. 直接运行：不启用云开发也可跑通页面流程（会走 Mock 数据）

## 当前实现说明（MVP）

- 首页：拍照/上传并触发分析
- 结果页：展示食材名称、鲜度、做法列表
- 采购单页：展示佐料清单，可勾选与分享

## 下一步

详见 docs/ 下的 PRD、接口结构与 Prompt 约定，用于把云函数的 mock 替换为真实多模态模型调用：

- docs/mvp-prd.md
- docs/api.md
- docs/prompt.md
- docs/dev.md
