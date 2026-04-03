// utils/voice.js
let recorderManager = null;
let currentConfig = null;

/**
 * 初始化录音管理器
 * @param {Object} config
 * @param {Function} config.onStart - 录音开始回调
 * @param {Function} config.onStop - 录音结束回调 (接收 res.tempFilePath)
 * @param {Function} config.onError - 录音错误回调 (接收 errMsg)
 */
function initRecordManager(config) {
  currentConfig = config;
  
  if (!recorderManager) {
    recorderManager = wx.getRecorderManager();
    
    recorderManager.onStart(() => {
      console.log('recorder start');
      if (currentConfig && currentConfig.onStart) {
        currentConfig.onStart();
      }
    });

    recorderManager.onStop((res) => {
      console.log('recorder stop', res);
      if (currentConfig && currentConfig.onStop) {
        currentConfig.onStop(res);
      }
    });

    recorderManager.onError((res) => {
      console.error('recorder error', res);
      if (currentConfig && currentConfig.onError) {
        currentConfig.onError(res.errMsg);
      }
    });
  }
}

/**
 * 开始录音
 */
function startRecord() {
  if (!recorderManager) {
    console.error('请先调用 initRecordManager');
    return;
  }
  
  wx.authorize({
    scope: 'scope.record',
    success() {
      // 火山引擎大模型极速版要求：音频格式支持 WAV / MP3 / OGG OPUS
      // 这里选用 mp3，采样率 16000 即可满足大部分语音识别要求
      const options = {
        duration: 60000, // 最长 60 秒
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      };
      recorderManager.start(options);
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
 * 停止录音
 */
function stopRecord() {
  if (recorderManager) {
    recorderManager.stop();
  }
}

module.exports = {
  initRecordManager,
  startRecord,
  stopRecord
};
