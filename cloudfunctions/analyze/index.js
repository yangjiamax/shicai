const axios = require('axios');
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const { imageBase64, fileID, userId, source } = event;
  
  let finalBase64 = imageBase64;

  if (fileID) {
    try {
      // 从云存储下载图片
      const res = await cloud.downloadFile({
        fileID: fileID
      });
      const buffer = res.fileContent;
      finalBase64 = buffer.toString('base64');
    } catch (err) {
      console.error('下载云存储图片失败:', err);
      return { error: true, errorType: 'file_read_error', message: '读取云端图片失败' };
    }
  }

  if (!finalBase64 || typeof finalBase64 !== 'string') {
    return { error: true, errorType: 'bad_response', message: '未收到图片数据' };
  }

  // 从环境变量获取配置
  const apiKey = process.env.LLM_API_KEY;
  const apiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const modelName = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    console.error('环境变量 LLM_API_KEY 未配置');
    return { error: true, errorType: 'model_error', message: '服务未正确配置' };
  }

  try {
    const prompt = `你是一个专业的厨师和食材鉴定专家。请分析提供的食材图片。请返回一个纯JSON对象，包含以下字段：
- "ingredient_name": (字符串) 食材名称。
- "ingredient_desc": (字符串) 简短的食材描述或烹饪建议。
- "freshness_level": (字符串) 鲜度等级，例如 "新鲜"、"一般" 或 "不新鲜"。
- "freshness_reason": (字符串) 基于图片视觉特征的鲜度判断理由。
- "recipes": (数组) 2-3个做法，每个对象包含 "recipe_name" (字符串，做法名称) 和 "ingredients_needed" (字符串数组，需要的佐料名称)。
只返回JSON，不要包含任何其他说明文字，也不要用Markdown代码块包裹。`;

    // 增加超时控制
    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${finalBase64}` } }
          ]
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 90000 // 90秒超时，小程序端是95秒
    });

    let content = response.data.choices[0].message.content;
    
    // 移除可能存在的 Markdown 代码块包裹
    content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    
    let resultData;
    try {
      resultData = JSON.parse(content);
    } catch (parseErr) {
      console.error('模型返回解析失败', content);
      return { error: true, errorType: 'model_error', message: '模型返回格式异常' };
    }

    // 字段兜底补齐
    return {
      ingredient_name: resultData.ingredient_name || '未知食材',
      ingredient_desc: resultData.ingredient_desc || '暂无描述',
      freshness_level: resultData.freshness_level || '未知',
      freshness_reason: resultData.freshness_reason || '未能识别鲜度原因',
      recipes: Array.isArray(resultData.recipes) && resultData.recipes.length > 0 ? resultData.recipes : [
        { recipe_name: '简单清炒', ingredients_needed: ['油', '盐'] }
      ]
    };
    
  } catch (err) {
    console.error('模型请求失败:', err.message);
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return { error: true, errorType: 'timeout', message: '模型请求超时' };
    }
    return { error: true, errorType: 'model_error', message: err.message };
  }
}
