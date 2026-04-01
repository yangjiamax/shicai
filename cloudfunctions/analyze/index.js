const axios = require('axios');
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const { imageBase64, fileID, userId, source, lang = 'zh', nationality, location, analyzeType = 'vision', ingredientName = '' } = event;
  
  // 从环境变量获取配置
  const apiKey = process.env.LLM_API_KEY;
  const apiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const modelName = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    console.error('环境变量 LLM_API_KEY 未配置');
    return { error: true, errorType: 'model_error', message: '服务未正确配置' };
  }

  try {
    let prompt = '';
    let locationText = '';
    if (location && location.lat && location.lng) {
      locationText = lang === 'en' 
        ? `User Location: latitude ${location.lat}, longitude ${location.lng}. ` 
        : `用户当前位置：纬度 ${location.lat}，经度 ${location.lng}。`;
    } else {
      locationText = lang === 'en' ? `User Location: unknown. ` : `用户当前位置：未知。`;
    }
    
    let nationalityText = '';
    if (nationality) {
      nationalityText = lang === 'en' ? `User Nationality: ${nationality}. ` : `用户国籍：${nationality}。`;
    } else {
      nationalityText = lang === 'en' ? `User Nationality: unknown. ` : `用户国籍：未知。`;
    }

    let messages = [];

    // --- STEP 1: Vision (视觉识别：食材与鲜度) ---
    if (analyzeType === 'vision') {
      let finalBase64 = imageBase64;
      if (fileID) {
        try {
          const res = await cloud.downloadFile({ fileID: fileID });
          finalBase64 = res.fileContent.toString('base64');
        } catch (err) {
          console.error('下载云存储图片失败:', err);
          return { error: true, errorType: 'file_read_error', message: '读取云端图片失败' };
        }
      }
      if (!finalBase64 || typeof finalBase64 !== 'string') {
        return { error: true, errorType: 'bad_response', message: '未收到图片数据' };
      }

      if (lang === 'en') {
        prompt = `You are a professional chef and ingredient identification expert. Please analyze the provided ingredient image.
Please return a pure JSON object containing the following fields:
- "ingredient_name": (String) Name of the ingredient.
- "ingredient_desc": (String) A purely objective one-sentence brief description (do not include any freshness-related details).
- "freshness_level": (String) Freshness level, e.g., "Fresh", "Average", or "Not fresh".
- "freshness_reason": (String) Reason for freshness judgment based on visual features in the image.
- "taste": (String) Taste (e.g., fresh and sweet, rich, etc.).
- "texture": (String) Texture (e.g., firm, tender, etc.).
- "similar": (String) Similar ingredients. Strictly output ONLY 1-3 common ingredient nouns.
Return ONLY JSON, do not include any other explanatory text, and do not wrap it in Markdown code blocks. Output ALL content in English. DO NOT mix any Chinese characters.`;
      } else {
        prompt = `你是一个专业的厨师和食材鉴定专家。请分析提供的食材图片。
请返回一个纯JSON对象，包含以下字段：
- "ingredient_name": (字符串) 食材名称。
- "ingredient_desc": (字符串) 纯客观的一句话简介（不包含任何死亡、腐败等新鲜度相关的细节）。
- "freshness_level": (字符串) 鲜度等级，例如 "新鲜"、"一般" 或 "不新鲜"。
- "freshness_reason": (字符串) 基于图片视觉特征的鲜度判断理由（如果食材有死亡、腐败等细节，请务必放在此处描述）。
- "taste": (字符串) 味道（如鲜甜、浓郁等）。
- "texture": (字符串) 口感（如紧实、细嫩等）。
- "similar": (字符串) 类似食材。请严格只输出1-3个常见的食材名词（如"龙眼"、"鲅鱼"）。
只返回JSON，不要包含任何其他说明文字，也不要用Markdown代码块包裹。所有内容请用中文输出。`;
      }
      
      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${finalBase64}`, detail: 'low' } }
          ]
        }
      ];
    } 
    // --- STEP 2: Familiar (文本生成：熟悉的味道与做法) ---
    else if (analyzeType === 'familiar') {
      if (!ingredientName) return { error: true, errorType: 'bad_request', message: 'Missing ingredientName' };
      
      let nationalityStr = nationality || (lang === 'en' ? 'the user\'s country' : '用户所在国');

      if (lang === 'en') {
        prompt = `You are a top local chef and food expert from ${nationalityStr}. You know exactly what tastes like "home" for people from your country.
Ingredient: "${ingredientName}".
Return a pure JSON object:
- "recipes_familiar": (Array) 1-2 authentic, home-style recipes from ${nationalityStr} using this ingredient. The recipes MUST be easy to cook for a beginner (doable with basic kitchenware and simple steps). Each object has "recipe_name" (String) and "ingredients_needed" (Array of Strings, focusing on local spices and condiments from ${nationalityStr}).
Return ONLY JSON. Output ALL content in English.`;
      } else {
        prompt = `你是一位来自${nationalityStr}的顶级本土厨师和美食家，最懂家乡胃，深知你们国家老百姓平时怎么做这道菜。
食材：“${ingredientName}”。
返回纯JSON对象：
- "recipes_familiar": (数组) 推荐1-2种在${nationalityStr}最地道、最常见的家常做法。注意：做法必须简单易学，是普通人稍微垫垫脚就能在家做出来的（无需复杂厨具和高难度技巧）。包含"recipe_name"(字符串，做法名称)和"ingredients_needed"(字符串数组，需包含你们国家做这道菜常用的特色佐料)。
只返回JSON，内容用中文。`;
      }
      
      messages = [
        { role: 'user', content: prompt }
      ];
    }
    // --- STEP 3: Local (文本生成：当地做法) ---
    else if (analyzeType === 'local') {
      if (!ingredientName) return { error: true, errorType: 'bad_request', message: 'Missing ingredientName' };
      
      let locStr = 'the user\'s current location';
      if (lang !== 'en') locStr = '用户当前所在地区';
      if (location && location.lat && location.lng) {
         locStr = `(Lat: ${location.lat}, Lng: ${location.lng})`;
      }

      if (lang === 'en') {
        prompt = `You are a native chef and local food expert living right here at ${locStr}. You know exactly how locals cook and eat in this specific region.
Ingredient: "${ingredientName}".
Return a pure JSON object:
- "recipes_local": (Array) 1-2 local specialty recipes using this ingredient, exactly how locals make it here. The recipes MUST be simple and easy for a beginner to cook at home. Each object has "recipe_name" (String) and "ingredients_needed" (Array of Strings, highlighting regional condiments).
Return ONLY JSON. Output ALL content in English.`;
      } else {
        prompt = `你是一位土生土长的本地厨师和美食家，目前生活在 ${locStr}。你对这片土地上的饮食文化和当地人烹饪这道食材的习惯了如指掌。
食材：“${ingredientName}”。
返回纯JSON对象：
- "recipes_local": (数组) 推荐1-2种这片区域当地人最常吃的特色做法。注意：做法必须接地气且简单易上手，是普通人稍微垫脚就能做出来的。包含"recipe_name"(字符串，使用当地人的叫法)和"ingredients_needed"(字符串数组，需体现当地特色配料)。
只返回JSON，内容用中文。`;
      }
      
      messages = [
        { role: 'user', content: prompt }
      ];
    }

    // 发起大模型请求
    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: messages
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: analyzeType === 'vision' ? 90000 : 30000 // 文本生成超时可以设短一些
    });

    let content = response.data.choices[0].message.content;
    content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    
    let resultData;
    try {
      resultData = JSON.parse(content);
    } catch (parseErr) {
      console.error('模型返回解析失败', content);
      return { error: true, errorType: 'model_error', message: '模型返回格式异常' };
    }

    // 根据不同步骤格式化返回结果
    if (analyzeType === 'vision') {
      let cleanSimilar = resultData.similar || '';
      if (cleanSimilar) {
        cleanSimilar = cleanSimilar.replace(/^(类似[于]?|口感[像]?|像)/, '').trim();
      }
      return {
        ingredient_name: resultData.ingredient_name || (lang === 'en' ? 'Unknown Ingredient' : '未知食材'),
        ingredient_desc: resultData.ingredient_desc || (lang === 'en' ? 'No description' : '暂无描述'),
        freshness_level: resultData.freshness_level || (lang === 'en' ? 'Unknown' : '未知'),
        freshness_reason: resultData.freshness_reason || (lang === 'en' ? 'Unable to recognize freshness reason' : '未能识别鲜度原因'),
        taste: resultData.taste || '',
        texture: resultData.texture || '',
        similar: cleanSimilar,
      };
    } else if (analyzeType === 'familiar') {
      const fallbackFamiliar = [
        { recipe_name: (lang === 'en' ? 'Simple Stir-fry' : '简单清炒'), ingredients_needed: (lang === 'en' ? ['Oil', 'Salt'] : ['油', '盐']) }
      ];
      let recipesFamiliar = resultData.recipes_familiar;
      if (!Array.isArray(recipesFamiliar) || recipesFamiliar.length === 0) {
        recipesFamiliar = fallbackFamiliar;
      }
      return {
        recipes_familiar: recipesFamiliar
      };
    } else if (analyzeType === 'local') {
      const fallbackLocal = [
        { recipe_name: (lang === 'en' ? 'Local Specialty' : '当地特色做法'), ingredients_needed: (lang === 'en' ? ['Oil', 'Salt', 'Garlic'] : ['油', '盐', '蒜']) }
      ];
      let recipesLocal = resultData.recipes_local;
      if (!Array.isArray(recipesLocal) || recipesLocal.length === 0) {
        recipesLocal = fallbackLocal;
      }
      return {
        recipes_local: recipesLocal
      };
    }
    
  } catch (err) {
    console.error('模型请求失败:', err.message);
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return { error: true, errorType: 'timeout', message: '模型请求超时' };
    }
    return { error: true, errorType: 'model_error', message: err.message };
  }
}
