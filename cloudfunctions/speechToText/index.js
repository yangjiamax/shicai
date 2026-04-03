const cloud = require('wx-server-sdk');
const axios = require('axios');
const uuid = require('uuid');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const { fileID } = event;

  if (!fileID) {
    return { error: true, message: '音频文件不能为空' };
  }

  const appId = (process.env.VOLC_APP_ID || '1190017188').trim();
  const accessToken = (process.env.VOLC_ACCESS_TOKEN || '').trim();

  if (!accessToken) {
    console.error('环境变量 VOLC_ACCESS_TOKEN 未配置');
    return { error: true, message: '服务端未正确配置语音识别接口' };
  }

  try {
    // 1. 从云存储下载音频文件
    const downloadRes = await cloud.downloadFile({
      fileID: fileID
    });
    
    const audioBuffer = downloadRes.fileContent;
    const base64Data = audioBuffer.toString('base64');

    // 2. 调用火山引擎大模型录音文件极速版识别 API
    const recognizeUrl = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
    const taskId = uuid.v4();
    
    const headers = {
      "X-Api-App-Key": appId,
      "X-Api-Access-Key": accessToken,
      "X-Api-Key": accessToken, // 兼容新版控制台
      "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
      "X-Api-Request-Id": taskId,
      "X-Api-Sequence": "-1",
      "Content-Type": "application/json"
    };

    const requestBody = {
      user: {
        uid: appId
      },
      audio: {
        format: "mp3",
        data: base64Data
      },
      request: {
        model_name: "bigmodel"
      }
    };

    console.log(`[STT] 发起语音识别请求, taskId: ${taskId}, audio size: ${base64Data.length}`);
    
    const response = await axios.post(recognizeUrl, requestBody, {
      headers: headers,
      timeout: 30000 // 30秒超时
    });

    const statusCode = response.headers['x-api-status-code'];
    const message = response.headers['x-api-message'];
    
    if (statusCode !== '20000000') {
      console.error(`[STT] API 返回错误: code=${statusCode}, message=${message}`);
      return { error: true, message: `语音识别失败: ${message || statusCode}` };
    }

    const resultText = response.data?.result?.text;
    
    if (!resultText) {
      console.warn('[STT] 识别结果为空');
      return { error: false, data: { text: '' } };
    }

    console.log(`[STT] 识别成功: ${resultText}`);
    
    // 3. (可选) 删除云存储中的临时音频文件，节省空间
    try {
      await cloud.deleteFile({
        fileList: [fileID]
      });
      console.log(`[STT] 已清理临时音频文件: ${fileID}`);
    } catch (deleteErr) {
      console.error(`[STT] 清理临时音频文件失败:`, deleteErr);
    }

    return {
      error: false,
      data: {
        text: resultText
      }
    };

  } catch (err) {
    console.error('[STT] 语音识别处理失败:', err.response ? err.response.data : err.message);
    const apiError = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    return { error: true, message: `语音识别API请求失败: ${apiError}` };
  }
};
