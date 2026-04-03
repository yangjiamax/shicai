// index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const { text, lang = 'zh' } = event;

  if (!text) {
    return { error: true, message: '输入文本不能为空' };
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
    let prompt = '';
    
    if (lang === 'en') {
      prompt = `You are an intelligent shopping assistant. Please extract the shopping list from the user's natural language input.
The input might describe ingredients directly (e.g. "I want to buy 2 apples"), or describe a dish they want to cook (e.g. "I want to make Sweet and Sour Pork").
CRITICAL INSTRUCTION: If the user mentions a DISH/RECIPE name (like "Sweet and Sour Pork" or "Kung Pao Chicken"), DO NOT just return the dish name as an ingredient! You MUST break down that dish into its essential raw ingredients (e.g. Pork Ribs, Sugar, Vinegar, Soy Sauce) and list them as individual items.
If the user's input is completely unrelated to food, recipes, or shopping, please return an empty JSON array [].

User Input: "${text}"

Please output a pure JSON array, where each element is an object with the following fields:
- "name": (String) The exact name of the ingredient (NOT the dish name).
- "standard_name": (String) A normalized, standard name for the ingredient.
- "quantity": (Number) The amount of the ingredient needed. If not mentioned, use 1.
- "unit": (String) The unit of measurement (e.g., "kg", "pieces", "lbs"). If not mentioned, use an appropriate default like "piece" or "".
- "category": (String) Supermarket aisle category, choose from: "Seafood, Meat & Eggs", "Fresh Produce", "Grains, Oils & Condiments", "Others".
- "source_recipe": (String) If this ingredient is for making a specific dish mentioned by the user, put the DISH NAME here (e.g., "Sweet and Sour Pork"). This is crucial for grouping ingredients by dish! If it's just a standalone ingredient, leave it as an empty string "".

Return ONLY JSON array. Do not include any other text or markdown wrappers like \`\`\`json. Output all values in English.`;
    } else {
      prompt = `你是一个智能购物管家。请从用户的自然语言输入中提取采购清单。
用户可能会直接说要买什么食材（例如“买两个苹果”），也可能会说要做某道菜（例如“做个夫妻肺片”或“辣炒香螺”）。
【核心指令】：如果用户提到的是“菜名”（如“夫妻肺片”、“糖醋排骨”），绝对不要把菜名本身当作一个要买的商品！你必须将这道菜拆解成做这道菜所需的“基础生鲜食材和调料”（例如做夫妻肺片需要：牛肉、牛心、牛舌、牛肚、辣椒油、花椒粉等），并将这些拆解后的具体食材作为独立的商品项返回。
如果用户的输入与食材、菜谱或购物完全无关，请返回空数组 []。

用户输入：“${text}”

请输出一个纯JSON数组，数组中的每个元素是一个对象，包含以下字段：
- "name": (字符串) 具体的食材名称（绝对不能是菜名本身）。
- "standard_name": (字符串) 归一化后的标准食材名称。
- "quantity": (数字) 提取出的数量，如果没有提到具体数量，默认为 1。
- "unit": (字符串) 提取出的量词/单位（如“斤”、“个”、“把”）。如果没有提到，请根据常识给一个合适的默认值（如“个”、“份”或留空 ""）。
- "category": (字符串) 超市动线分类，请严格从以下选项中选择：["鱼鲜肉蛋", "生鲜蔬果", "粮油配料", "其他"]。
- "source_recipe": (字符串) 如果这个食材是为了做某道菜，请在这里填入那道【菜名】（例如“夫妻肺片”）。这非常重要，用于后续按菜谱分组！如果只是单纯买食材没有提到做菜，请留空字符串 ""。

只返回JSON数组，不要包含任何其他说明文字，也不要用Markdown代码块包裹。所有内容请用中文输出。`;
    }

    const messages = [
      { role: 'user', content: prompt }
    ];

    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: messages,
      temperature: 0.3 // 低温度，确保输出结构化和稳定性
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000
    });

    let content = response.data.choices[0].message.content;
    content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    let resultData;
    try {
      resultData = JSON.parse(content);
    } catch (parseErr) {
      console.error('模型返回解析失败', content);
      return { error: true, errorType: 'model_error', message: '提取失败，请重试' };
    }

    return {
      error: false,
      data: resultData
    };

  } catch (err) {
    console.error('LLM 请求失败:', err.response ? err.response.data : err.message);
    return { error: true, errorType: 'network_error', message: '网络请求失败，请稍后重试' };
  }
};
