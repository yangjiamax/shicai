# 痛点四：录音死锁问题修复方案 (Voice Recording Deadlock Fix Plan)

## 1. 结论先行与核心问题溯源
当前小程序在首页的“右滑录音”交互中存在**状态机死锁（竞态条件）**。
- **原逻辑输入/输出溯源**：用户触发 `onSwipeEnd` -> 调用 `startVoiceRecord` -> 调用底层的 `voiceUtil.startRecord()` -> 等待微信底层回调 `onStart` -> 异步将页面状态 `isRecording` 置为 `true`。
- **漏洞所在**：
  1. **异步锁间隙**：从触发滑动到微信底层回调 `onStart` 之间存在时间差。如果用户在此间隙内疯狂滑动，由于 `isRecording` 还是 `false`，会多次并发触发 `startVoiceRecord()`。微信底层拒绝并发启动，导致后续录音失效且报错。
  2. **中断事件遗漏**：`index.wxml` 中的滑动按钮没有绑定 `bindtouchcancel`。当手指滑出屏幕或被系统弹窗打断时，滑动状态（`swipeX`）无法复位，且可能卡在错误的状态。

## 2. 规则层判断与约束
- **防抖与并发控制（Concurrency Prevention）**：在任何录音初始化流程未完成（未收到成功或失败回调）期间，必须在**同步层**无视用户的任何重复录音请求。
- **UI 状态守恒（UI State Integrity）**：无论触摸事件如何结束（正常抬起 `touchend` 或异常中断 `touchcancel`），UI 元素必须强制回归初始坐标和初始状态。
- **降维回退（Fallback & Recovery）**：一旦底层抛出任何异常，必须强制释放前端的所有锁，确保用户能通过再次点击进行重试，而不是陷入“当前正在录音”的永久死锁。

## 3. 实现层落地方案（最小侵入原则）

### 3.1 视图层 (WXML) 补齐中断事件
- **文件**：`miniprogram/pages/index/index.wxml`
- **改动**：在 `<view class="swipe-btn">` 元素上，补充 `bindtouchcancel="onSwipeCancel"`，填补事件监听的盲区。

### 3.2 逻辑层 (JS) 引入同步竞态锁与复位逻辑
- **文件**：`miniprogram/pages/index/index.js`
- **改动点 1：新增 `onSwipeCancel` 方法**
  确保异常中断时，将 `swipeX` 归零，并重置动画过渡效果。
  ```javascript
  onSwipeCancel(e) {
    this.setData({
      swipeX: 0,
      swipeTransition: 'transform 0.3s ease'
    });
    // 若此时正在初始化录音，视情况可以调用 stopRecord()
  }
  ```
- **改动点 2：引入 `this._isVoiceStarting` 同步锁**
  在 `startVoiceRecord()` 方法开头，增加同步拦截：
  ```javascript
  startVoiceRecord() {
    if (this._isVoiceStarting) return; // 同步竞态锁
    this._isVoiceStarting = true; // 立即上锁
    
    const voiceUtil = require('../../utils/voice.js');
    voiceUtil.initRecordManager({
      onStart: () => {
        this._isVoiceStarting = false; // 底层真正启动后，释放启动锁
        this.setData({ isRecording: true });
      },
      onError: (errMsg) => {
        this._isVoiceStarting = false; // 异常时释放启动锁
        this.setData({ isRecording: false });
        // ... 原有错误处理逻辑
      },
      onStop: async (res) => {
        this._isVoiceStarting = false; // 确保释放
        this.setData({ isRecording: false });
        // ... 原有处理逻辑
      }
    });
    voiceUtil.startRecord();
  }
  ```
- **改动点 3：优化 `onSwipeStart`, `onSwipeMove`, `onSwipeEnd`, `onSwipeTap` 的拦截判断**
  将原有的 `if (this.data.isRecording) return;` 升级为 `if (this.data.isRecording || this._isVoiceStarting) return;`，防止在初始化间隙发生任何滑动交互。

## 4. 验收标准与测试用例

1. **暴力滑动测试（竞态模拟）**：
   - 操作：在 IDE 或真机上，对着悬浮麦克风疯狂左右滑动（1秒内滑动数次）。
   - 预期：控制台只触发一次录音启动，不报 `data exceed max size` 或微信底层并发初始化错误。
2. **中断测试（TouchCancel 模拟）**：
   - 操作：按下录音的瞬间，让手指迅速滑出屏幕边缘（真机）或移出模拟器窗口（IDE）。
   - 预期：按钮自动弹回原位，不会卡在滑动一半的位置。随后再次点击或滑动，依然能正常发起录音。
3. **主流程回归**：
   - 操作：正常单点（若未录音提示文案）、正常右滑录音、录音中单点停止。
   - 预期：老流程 I/O 守恒，一切体验顺滑无阻。

## 5. 长期协作规则沉淀 (Skill/SOP)
- **【小程序手势规范】**：凡是涉及 `bindtouchstart` / `bindtouchmove` / `bindtouchend` 的自定义手势组件，**必须强制绑定 `bindtouchcancel`** 进行状态兜底，以防系统级中断导致 UI 状态死锁。
- **【异步 API 并发规范】**：调用微信底层高延迟或需要鉴权的 API（如录音、蓝牙、支付）时，**禁止仅依赖 `setData` 异步回调作为防抖锁**，必须在函数入口使用 `this._xxxing = true` 同步变量拦截并发点击。