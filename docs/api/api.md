# 接口约定（MVP）

## 1. 云函数：analyze

### 1.1 调用方式

小程序端：

- `wx.cloud.callFunction({ name: "analyze", data })`

### 1.2 请求参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| imageBase64 | string | 是 | 图片 Base64（不含 data:image/... 前缀） |

### 1.3 响应体（result）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| ingredient_name | string | 是 | 食材中文名 |
| ingredient_desc | string | 否 | 一句话简介/提醒 |
| freshness_level | string | 是 | 新鲜｜一般｜不太新鲜 |
| freshness_reason | string | 是 | 判断依据（1 句） |
| recipes | array | 是 | 推荐做法（2-3 个） |

`recipes[]`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| recipe_name | string | 是 | 做法名称 |
| ingredients_needed | array | 是 | 佐料清单（字符串数组） |

### 1.4 示例

```json
{
  "ingredient_name": "鲈鱼",
  "ingredient_desc": "适合清蒸，注意去腥",
  "freshness_level": "新鲜",
  "freshness_reason": "鱼眼清澈微凸，鱼身有光泽",
  "recipes": [
    {
      "recipe_name": "清蒸鲈鱼",
      "ingredients_needed": ["葱", "姜", "料酒", "蒸鱼豉油", "食用油"]
    }
  ]
}
```

### 1.5 失败处理（MVP）

- 云函数报错：小程序端提示「识别失败，请重试」
- 结果缺字段：前端使用兜底文案（默认“未知食材/一般”）

---

## 2. 云函数：analyze (Action: search_tutorial)

> 仅用于检索第三方视频平台的做法链接（M16 新增）

### 2.1 请求参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| action | string | 是 | 必须固定为 `"search_tutorial"` |
| keyword | string | 是 | 搜索关键词（如 "红烧肉 做法"） |
| lang | string | 否 | 用户当前语言（'zh' 或 'en'），用于错误提示适配 |

### 2.2 响应体（result）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| error | boolean | 是否发生错误 |
| data | object | 检索到的做法数据 |

`data` 结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| bilibili | array | B站的视频列表 |

每个平台数组内元素的结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 视频或帖子标题 |
| url | string | 链接地址 |
| thumbnail | string | 视频缩略图 URL |
| source | string | 来源标识（"bilibili"） |

### 2.3 示例

```json
{
  "error": false,
  "data": {
    "bilibili": [
      {
        "title": "王刚：【红烧肉】的家常做法",
        "url": "https://www.bilibili.com/video/BV1xx411c7mD/",
        "thumbnail": "https://i1.hdslb.com/bfs/archive/xxxxxx.jpg",
        "source": "bilibili"
      }
    ]
  }
}
```
