// utils/voice.js
const plugin = requirePlugin("WechatSI");
let manager = null;
let currentConfig = null;

/**
 * 初始化语音识别管理器
 * @param {Object} config
 * @param {Function} config.onStart - 录音开始回调
 * @param {Function} config.onRecognize - 识别中回调 (接收 res.result)
 * @param {Function} config.onStop - 录音结束回调 (接收 res.result, res.tempFilePath)
 * @param {Function} config.onError - 录音错误回调 (接收 res.msg)
 */
function initRecordManager(config) {
  currentConfig = config;
  
  if (!manager) {
    manager = plugin.getRecordRecognitionManager();
    
    manager.onStart = function(res) {
      console.log('WechatSI manager start', res);
      if (currentConfig && currentConfig.onStart) {
        currentConfig.onStart(res);
      }
    };
    
    manager.onRecognize = function(res) {
      console.log('WechatSI manager recognize', res.result);
      if (currentConfig && currentConfig.onRecognize) {
        currentConfig.onRecognize(res.result);
      }
    };

    manager.onStop = function(res) {
      console.log('WechatSI manager stop', res.result);
      if (currentConfig && currentConfig.onStop) {
        currentConfig.onStop(res);
      }
    };

    manager.onError = function(res) {
      console.error('WechatSI manager error', res.msg);
      if (currentConfig && currentConfig.onError) {
        currentConfig.onError(res.msg);
      }
    };
  }
}

/**
 * 开始录音并识别
 */
function startRecord() {
  if (!manager) {
    console.error('请先调用 initRecordManager');
    return;
  }
  
  wx.authorize({
    scope: 'scope.record',
    success() {
      // 开始识别，最长 60 秒
      manager.start({ duration: 60000, lang: "zh_CN" });
    },
    fail() {
      wx.showModal({
        title: '需要录音权限',
        content: '请在设置中开启录音权限以使用语音输入功能',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting();
          }
        }
      });
      if (currentConfig && currentConfig.onError) {
        currentConfig.onError('user_denied');
      }
    }
  });
}

/**
 * 停止录音并结束识别
 */
function stopRecord() {
  if (manager) {
    manager.stop();
  }
}

module.exports = {
  initRecordManager,
  startRecord,
  stopRecord
};
