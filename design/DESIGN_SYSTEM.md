# Design System Document: Organic Precision

## 0. Stitch 导出原型索引（design/_*）

| Stitch 目录 | 页面 | 业务意图 | 对应小程序页面（当前代码） | 文件 |
| --- | --- | --- | --- | --- |
| `_5` | 登录 / 欢迎页 | 建立品牌第一印象；微信登录/匿名体验入口 | 暂未实现 | [code.html](../_5/code.html) · [screen.png](../_5/screen.png) |
| `_3` | 首页（拍照识别入口） | 拍照/相册上传识别；最近识别列表 | `/miniprogram/pages/index/index` | [code.html](../_3/code.html) · [screen.png](../_3/screen.png) |
| `_4` | 识别结果页 | 展示食材、鲜度、依据；推荐做法；生成采购单入口 | `/miniprogram/pages/result/result` | [code.html](../_4/code.html) · [screen.png](../_4/screen.png) |
| `_2` | 采购清单页 | 根据做法生成佐料/食材清单；勾选；再次识别 | `/miniprogram/pages/list/list` | [code.html](../_2/code.html) · [screen.png](../_2/screen.png) |
| `_1` | 我的 / 个人中心 | 账号信息、识别统计、历史入口、设置/退出 | 暂未实现 | [code.html](../_1/code.html) · [screen.png](../_1/screen.png) |

备注：这些 `code.html` 是静态高保真原型（Tailwind CDN + Google Fonts）。本地打开时需要联网加载外链资源。

## 1. Overview & Creative North Star
The Creative North Star for this system is **"The Botanical Archivist."** 

We are moving away from the "template-heavy" look of standard WeChat Mini Programs. Instead, we treat the UI as a high-end, digital apothecary or a modern culinary journal. The aesthetic marries the warmth of an organic lifestyle with the rigorous precision of a minimalist editorial layout. 

While based on the TDesign framework, we elevate it through **intentional asymmetry**, **overlapping editorial elements**, and **tonal layering**. We do not use lines to define space; we use light and depth. The "Greedy Cat" mascot is not just a logo—it is a signature of character, appearing in subtle, high-contrast moments to break the "sterile" feel of traditional e-commerce.

---

## 2. Colors & Surface Philosophy

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for sectioning. To separate content, designers must use **background color shifts**. For instance, a product category section should sit on `surface-container-low` (#f6f3f2), while the individual product cards utilize `surface-container-lowest` (#ffffff) to create a natural, soft lift.

### Surface Hierarchy & Nesting
Treat the interface as a physical stack of fine paper. 
- **Base Layer:** `surface` (#fcf9f8)
- **Sectioning Layer:** `surface-container-low` (#f6f3f2)
- **Interactive Card Layer:** `surface-container-lowest` (#ffffff)
- **Overlay/Modal Layer:** `surface-bright` (#fcf9f8) with ambient shadows.

### The "Glass & Gradient" Rule
To add "soul" to the herbal green theme:
- **Hero CTAs:** Use a subtle linear gradient from `primary` (#4b6338) to `primary-container` (#637c4e).
- **Floating Navigation/Header:** Use Glassmorphism. Apply a semi-transparent `surface` color with a 20px backdrop-blur. This allows the vibrant colors of fresh produce to bleed through the UI, making the app feel alive and integrated.

---

## 3. Typography: The Editorial Voice

We utilize a high-contrast scale to create an authoritative yet friendly hierarchy.

- **The Headline Voice:** `plusJakartaSans` is our personality. Use `display-md` or `headline-lg` for product categories and hero titles. The tight kerning and geometric curves reflect the "Precision" in our North Star.
- **The Functional Voice:** `inter` is our workhorse. Used for `body` and `label` tiers, it ensures maximum readability at high information densities. 
- **Intentional Scaling:** Don't be afraid of the "Gap." Use `display-sm` (2.25rem) immediately adjacent to `body-sm` (0.75rem) to create a sophisticated, high-end editorial feel that guides the eye to what matters most: the freshness of the product.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Layering**. Use the `surface-container` tiers to define priority. A "Featured" item doesn't get a border; it gets a `surface-container-highest` (#e4e2e1) background to pull it forward.

### Ambient Shadows
When an element must float (e.g., a "Add to Cart" sticky button), use a shadow tinted with the brand’s soul:
- **Shadow Color:** 6% opacity of `on-surface` (#1b1c1c).
- **Blur:** 24px - 32px (extra-diffused).
- **Y-Offset:** 8px.
This mimics natural light passing through a botanical garden, rather than a harsh digital drop shadow.

### The "Ghost Border" Fallback
If accessibility requires a container boundary, use a **Ghost Border**: `outline-variant` (#c4c8bb) at 15% opacity. It should be felt, not seen.

---

## 5. Components

### Buttons (The Interaction Anchor)
- **Primary:** Rounded `DEFAULT` (0.5rem). Use the Signature Gradient (`primary` to `primary-container`). Label in `on-primary`.
- **Secondary:** `secondary-container` (#d3e6bd) background with `on-secondary-container` (#576847) text. No border.
- **Tertiary:** Pure text using `title-sm` weight, with a `primary` color.

### Cards & Product Lists
- **Forbid Divider Lines:** Use `spacing-6` (1.3rem) of vertical white space or a shift from `surface-container-lowest` to `surface-container-low`.
- **Image Treatment:** Product images should have a `md` (0.75rem) corner radius. Use a 2% `on-surface` inner stroke to ensure white products don't disappear into white cards.

### Input Fields
- Avoid the "box" look. Use a `surface-container-low` fill with a `sm` (0.25rem) bottom-only radius.
- On focus, transition the background to `surface-container-lowest` and add a 1px "Ghost Border."

### The "Greedy Cat" Signature Elements
- **Loading States:** A minimalist animation of the cat icon's green eyes blinking.
- **Empty States:** The cat icon looking into an empty herbal basket, rendered in `outline-variant`.
- **Micro-interactions:** When a user "favors" an item, the cat’s black ear patch can twitch—a subtle nod to the brand's playful personality.

---

## 6. Do's and Don'ts

### Do:
- **Use Asymmetric Spacing:** Balance a heavy image on the left with a large `display-sm` title and plenty of `surface` white space on the right.
- **Prioritize Readability:** In high-density layouts, use `label-sm` in `on-surface-variant` for metadata to keep the primary `body-md` text clear.
- **Embrace the Green:** Use `primary-fixed-dim` (#b3cf9a) for large background decorative elements to reinforce the "Herbal" warmth.

### Don't:
- **Don't use 100% Black:** Never use #000000. Use `on-surface` (#1b1c1c) for all "black" text to maintain the soft, organic feel.
- **Don't use hard corners:** Every interactive element must have at least a `sm` (4px) radius to maintain the "Friendly" brand pillar.
- **Don't use standard dividers:** If you feel the need to draw a line, try adding 1.5rem of white space instead. If that fails, use a subtle background color change.
