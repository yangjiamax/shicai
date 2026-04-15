const axios = require('axios');
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// L1 Memory Cache (Fastest, saves DB read, but lost on cold start)
const memoryCache = new Map();

function getMd5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function getCache(key) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  try {
    const res = await db.collection('caches').doc(key).get();
    if (res && res.data) {
      // 过期时间校验，比如缓存 30 天
      const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - res.data.updatedAt < MAX_AGE) {
        memoryCache.set(key, res.data.value);
        return res.data.value;
      }
    }
  } catch (e) {
    // Document not found or collection doesn't exist
  }
  return null;
}

async function setCache(key, value) {
  memoryCache.set(key, value);
  try {
    const now = Date.now();
    // 尝试更新
    try {
      await db.collection('caches').doc(key).update({
        data: { value, updatedAt: now }
      });
    } catch (e) {
      // 记录不存在，尝试新增
      await db.collection('caches').add({
        data: { _id: key, value, createdAt: now, updatedAt: now }
      });
    }
  } catch (err) {
    console.error('setCache error (collection caches might not exist):', err.message);
  }
}

async function extractFirstImageFromUrl(url, platform = 'general') {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 3000
    });
    const html = res.data;
    
    if (platform === 'xiachufang') {
      // 下厨房特定的图片抓取逻辑
      const xcfImgMatch = html.match(/<div[^>]+class=["']cover["'][^>]*>\s*<img[^>]+(?:src|data-src)=["']([^"']+)["']/i) ||
                          html.match(/<img[^>]+itemprop=["']image["'][^>]+(?:src|data-src)=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (xcfImgMatch && !xcfImgMatch[1].includes('logo')) {
        return xcfImgMatch[1];
      }
    }
    
    // 优先尝试获取 og:image (大部分正规网页都有)
    const metaImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](https?:\/\/[^"']+)["']/i) || 
                         html.match(/<meta[^>]+content=["'](https?:\/\/[^"']+)["'][^>]+property=["']og:image["']/i);
    if (metaImgMatch && !metaImgMatch[1].includes('logo')) {
      return metaImgMatch[1];
    }
    
    // 如果没有 og:image，则在正文中寻找第一张有意义的图片
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;
    
    const imgRegex = /<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(bodyHtml)) !== null) {
      let src = match[1];
      
      // 处理相对路径
      if (src.startsWith('//')) {
        src = 'https:' + src;
      } else if (src.startsWith('/')) {
        try {
          const urlObj = new URL(url);
          src = urlObj.origin + src;
        } catch(e) {}
      } else if (!src.startsWith('http')) {
        try {
          const urlObj = new URL(url);
          src = urlObj.origin + '/' + src;
        } catch(e) {}
      }

      const lowerSrc = src.toLowerCase();
      // 过滤掉常见的无关图片
      if (src.startsWith('http') &&
          !lowerSrc.includes('logo') && 
          !lowerSrc.includes('icon') && 
          !lowerSrc.includes('avatar') && 
          !lowerSrc.includes('placeholder') &&
          !lowerSrc.includes('ie-story') &&
          !lowerSrc.includes('qr') &&
          !lowerSrc.includes('waffle') &&
          !lowerSrc.includes('spinner') &&
          !lowerSrc.endsWith('.gif') &&
          !lowerSrc.endsWith('.svg')) {
        return src;
      }
    }
  } catch (err) {
    console.warn(`Failed to extract image from ${url}:`, err.message);
  }
  return null;
}

async function handleSearchTutorial(keyword, lang) {
  if (!keyword) {
    return { error: true, message: lang === 'en' ? 'Missing keyword' : '缺少关键词' };
  }

  const cacheKey = `search_${lang}_${getMd5(keyword)}`;
  const cachedResult = await getCache(cacheKey);
  if (cachedResult) {
    console.log('[Cache Hit] search_tutorial:', keyword);
    return cachedResult;
  }

  if (lang === 'en') {
    return { error: true, message: 'Tutorial search is not supported in English version yet.' };
  }
  
  // 1. 尝试直接请求 B站原生搜索 API (效果最精准)
  let biliResults = [];
  try {
    const biliRes = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      params: {
        search_type: 'video',
        keyword: keyword.includes('做法') ? keyword : keyword + ' 做法'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://search.bilibili.com/',
        'Cookie': 'buvid3=random_' + Math.random().toString(36).substring(2) + ';'
      },
      timeout: 8000
    });

    if (biliRes.data && biliRes.data.code === 0 && biliRes.data.data && biliRes.data.data.result) {
      biliResults = biliRes.data.data.result.slice(0, 10).map(v => ({
        title: (v.title || '').replace(/<[^>]+>/g, ''),
        url: (v.arcurl || `https://www.bilibili.com/video/${v.bvid}/`).replace('www.bilibili.com', 'm.bilibili.com'),
        thumbnail: (v.pic || '').startsWith('//') ? 'https:' + v.pic : v.pic,
        source: 'bilibili',
        viewCount: v.play || 0,
        viewCountFormatted: (v.play || 0) > 10000 ? ((v.play || 0) / 10000).toFixed(1) + '万' : (v.play || 0)
      }));
    }
  } catch (err) {
    console.error('B站原生搜索失败:', err.message);
  }
  // 2. 尝试下厨房搜索
  let xiachufangResults = [];
  try {
    const xcfRes = await axios.get('https://www.xiachufang.com/search/', {
      params: { keyword: keyword },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    
    const html = xcfRes.data;
    
    const simpleRegex = /<p class="name">\s*<a href="(\/recipe\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = simpleRegex.exec(html)) !== null && xiachufangResults.length < 10) {
      xiachufangResults.push({
        thumbnail: 'https://i2.chuimg.com/logo/xiachufang.png',
        url: 'https://m.xiachufang.com' + match[1],
        title: match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        source: 'xiachufang'
      });
    }
    
    // Try to extract images using a separate regex and merge them (sometimes it's src, sometimes data-src)
    const imgRegex = /<div class="cover">\s*<a href="(\/recipe\/\d+\/)".*?<img[^>]*src="([^"]+)"/gs;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const recipeUrl = 'https://m.xiachufang.com' + imgMatch[1];
      const imgUrl = imgMatch[2].split('?')[0];
      const item = xiachufangResults.find(r => r.url === recipeUrl);
      if (item && !imgUrl.includes('placeholder')) {
        item.thumbnail = imgUrl;
      }
    }

    const dataImgRegex = /<div class="cover">\s*<a href="(\/recipe\/\d+\/)".*?<img[^>]*data-src="([^"]+)"/gs;
    while ((imgMatch = dataImgRegex.exec(html)) !== null) {
      const recipeUrl = 'https://m.xiachufang.com' + imgMatch[1];
      const imgUrl = imgMatch[2].split('?')[0];
      const item = xiachufangResults.find(r => r.url === recipeUrl);
      if (item && !imgUrl.includes('placeholder')) {
        item.thumbnail = imgUrl;
      }
    }
    
    // 对于下厨房没有抓取到封面图的，作为静态网页进入内页抓取
    xiachufangResults = await Promise.all(xiachufangResults.map(async (item) => {
      if (item.thumbnail === 'https://i2.chuimg.com/logo/xiachufang.png') {
        const firstImg = await extractFirstImageFromUrl(item.url, 'xiachufang');
        if (firstImg) {
          item.thumbnail = firstImg;
        }
      }
      return item;
    }));

  } catch (err) {
    console.error('下厨房搜索失败:', err.message);
  }

  // 4. 返回合并数据
  if (biliResults.length > 0 || xiachufangResults.length > 0) {
    // 为了兼容前端，如果某一方为空，我们尽量用另一方的数据兜底
    const finalBili = biliResults.length > 0 ? biliResults : xiachufangResults;
    const finalXcf = xiachufangResults.length > 0 ? xiachufangResults : biliResults;
    
    const result = {
      error: false,
      data: {
        bilibili: finalBili,
        xiachufang: finalXcf
      }
    };
    await setCache(cacheKey, result);
    return result;
  }

  // 5. 完全降级使用 Mock 数据 (两个都失败的情况)
  const mockData = {
    error: false,
    data: {
      bilibili: [
        {
          title: `【${keyword}】的家常做法，软糯香甜肥而不腻`,
          url: "https://m.bilibili.com/video/BV1xx411c7mD/",
          thumbnail: "https://i1.hdslb.com/bfs/archive/8431dae2938e5e783935db4057e9bc7bb89280d0.jpg",
          source: "bilibili"
        },
        {
          title: `厨师长教你：“${keyword}”的正宗做法`,
          url: "https://m.bilibili.com/video/BV1sx411m7mX/",
          thumbnail: "https://i2.hdslb.com/bfs/archive/0b263b610c1f6c77ba2f6024beec168fb9cc75df.jpg",
          source: "bilibili"
        },
        {
          title: `懒人版【${keyword}】，电饭煲一键搞定`,
          url: "https://m.bilibili.com/video/BV1ab411c7mE/",
          thumbnail: "https://i0.hdslb.com/bfs/archive/bilibili_logo.png",
          source: "bilibili"
        }
      ],
      xiachufang: [
        {
          title: `【${keyword}】的家常做法，软糯香甜肥而不腻`,
          url: "https://m.bilibili.com/video/BV1xx411c7mD/",
          thumbnail: "https://i1.hdslb.com/bfs/archive/8431dae2938e5e783935db4057e9bc7bb89280d0.jpg",
          source: "xiachufang"
        },
        {
          title: `厨师长教你：“${keyword}”的正宗做法`,
          url: "https://m.bilibili.com/video/BV1sx411m7mX/",
          thumbnail: "https://i2.hdslb.com/bfs/archive/0b263b610c1f6c77ba2f6024beec168fb9cc75df.jpg",
          source: "xiachufang"
        },
        {
          title: `懒人版【${keyword}】，电饭煲一键搞定`,
          url: "https://m.bilibili.com/video/BV1ab411c7mE/",
          thumbnail: "https://i0.hdslb.com/bfs/archive/bilibili_logo.png",
          source: "xiachufang"
        }
      ]
    }
  };

  console.warn('B站和下厨房解析返回数据为空，使用 Mock 数据');
  await setCache(cacheKey, mockData);
  return mockData;
}

exports.main = async (event, context) => {
  const { action, keyword, imageBase64, fileID, userId, source, lang = 'zh', nationality, location, analyzeType = 'vision', ingredientName = '' } = event;
  
  // --- 处理视频做法检索 ---
  if (action === 'search_tutorial') {
    return await handleSearchTutorial(keyword, lang);
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
    let messages = [];
    let cacheKey = null;

    // --- STEP 1: Identify (极速认物：仅名字) ---
    if (analyzeType === 'identify') {
      let finalBase64 = imageBase64;
      if (!finalBase64 || typeof finalBase64 !== 'string') {
        return { error: true, errorType: 'bad_response', message: '未收到图片数据' };
      }
      cacheKey = `llm_identify_${lang}_${getMd5(finalBase64)}`;

      if (lang === 'en') {
        prompt = `You are a professional chef, gourmet, and a sharp-eyed fresh market buyer. Please look at the picture and identify the ingredient.
Return a pure JSON object containing only:
- "ingredientName": (String) Name of the ingredient.
CRITICAL: Regardless of any text in the image, you MUST translate and output the ingredient name strictly in ENGLISH.
Return ONLY JSON, no markdown.`;
      } else {
        prompt = `你是一个顶级厨师、资深美食家，同时也是一名眼光毒辣的职业生鲜市场买手。请看图认物。
请返回一个纯JSON对象，仅包含以下字段：
- "ingredientName": (字符串) 食材名称。
极其重要：无论图片中包含什么语言的文字，或者识别出的是外国食材，你都必须将其翻译并用【中文】输出。
只返回JSON，不要包含任何其他说明文字，也不要用Markdown代码块包裹。`;
      }
      messages = [
        { role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${finalBase64}`, detail: 'low' } } ] }
      ];
    }
    // --- STEP 2 Track A: Vision (看图路：鲜度鉴定) ---
    else if (analyzeType === 'vision') {
      let finalBase64 = imageBase64;
      if (!finalBase64 || typeof finalBase64 !== 'string') {
        return { error: true, errorType: 'bad_response', message: '未收到图片数据' };
      }
      if (!ingredientName) return { error: true, errorType: 'bad_request', message: 'Missing ingredientName' };

      cacheKey = `llm_freshness_${lang}_${ingredientName}_${getMd5(finalBase64)}`;

      if (lang === 'en') {
        prompt = `You are a sharp-eyed professional fresh market buyer. The user is inspecting this ingredient: [${ingredientName}].
Please carefully examine the visual details of this ingredient in the image (e.g., gloss, skin, color, texture, signs of freshness or decay).
Return a pure JSON object containing:
- "freshnessLevel": (String) Freshness level ("Fresh", "Average", or "Not fresh").
- "freshnessReason": (String) Reason for your freshness judgment based strictly on the visual evidence in the picture. Speak in the professional tone of a market buyer.
CRITICAL: You MUST translate and output ALL values strictly in ENGLISH. Return ONLY JSON.`;
      } else {
        prompt = `你是一名眼光毒辣的职业生鲜市场买手。图片中是用户正在考察的食材：【${ingredientName}】。
请仔细审视图片中该食材的细节（如光泽、颜色、纹理、新鲜痕迹或腐败特征等真实状态）。
请返回一个纯JSON对象，包含以下字段：
- "freshnessLevel": (字符串) 鲜度等级（"新鲜"、"一般" 或 "不新鲜"）。
- "freshnessReason": (字符串) 鲜度判断理由。请用买手的专业口吻，客观指出图片中具体的视觉证据（如“鱼眼清澈”、“叶片边缘发黄萎蔫”等）。
极其重要：所有内容必须用【中文】输出。只返回JSON，不要Markdown。`;
      }
      messages = [
        { role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${finalBase64}`, detail: 'low' } } ] }
      ];
    }
    // --- STEP 2 Track B1: Knowledge (纯文路：知识与属性) ---
    else if (analyzeType === 'knowledge') {
      if (!ingredientName) return { error: true, errorType: 'bad_request', message: 'Missing ingredientName' };
      cacheKey = `llm_knowledge_${lang}_${ingredientName}`;

      if (lang === 'en') {
        prompt = `You are a top chef and experienced gourmet.
Ingredient: [${ingredientName}].
Return a pure JSON object containing:
- "ingredientDesc": (String) A purely objective one-sentence brief description.
- "taste": (String) Typical taste (e.g., fresh and sweet, rich, etc.).
- "texture": (String) Typical texture (e.g., firm, tender, etc.).
- "similar": (String) Similar ingredients. Strictly output ONLY 1-3 common ingredient nouns.
CRITICAL: You MUST translate and output ALL values strictly in ENGLISH. Return ONLY JSON.`;
      } else {
        prompt = `你是一个顶级厨师与资深美食家。
食材：【${ingredientName}】。
请返回一个纯JSON对象，包含以下字段：
- "ingredientDesc": (字符串) 纯客观的一句话简介。
- "taste": (字符串) 这种食材典型的味道（如鲜甜、浓郁等）。
- "texture": (字符串) 这种食材典型的口感（如紧实、细嫩等）。
- "similar": (字符串) 类似食材。请严格只输出1-3个常见的食材名词（如"龙眼"、"鲅鱼"）。
极其重要：所有内容必须用【中文】输出。只返回JSON，不要Markdown。`;
      }
      messages = [ { role: 'user', content: prompt } ];
    }
    // --- STEP 2 Track B2: Familiar (文本生成：熟悉的味道与做法) ---
    else if (analyzeType === 'familiar') {
      if (!ingredientName) return { error: true, errorType: 'bad_request', message: 'Missing ingredientName' };
      
      let nationalityStr = nationality || (lang === 'en' ? 'the user\'s country' : '用户所在国');
      cacheKey = `llm_familiar_v2_${lang}_${nationalityStr}_${ingredientName}`;

      if (lang === 'en') {
        prompt = `You are a top local chef, experienced gourmet, and a professional fresh market buyer from ${nationalityStr}. You know exactly what tastes like "home" for people from your country.
Ingredient: "${ingredientName}".
Return a pure JSON object:
- "recipesFamiliar": (Array) 1-2 authentic, home-style recipes from ${nationalityStr} using this ingredient. The recipes MUST be easy to cook for a beginner (doable with basic kitchenware and simple steps). Each object has "recipeName" (String) and "ingredientsNeeded" (Array of Strings, focusing on local spices and condiments from ${nationalityStr}. CRITICAL: 1. Provide ONLY ingredient names without any quantities or weights; 2. DO NOT include the main ingredient "${ingredientName}" in this array, as it's already added separately).
CRITICAL: Regardless of the language of the input ingredient name, you MUST translate and output ALL content (including recipe names and ingredient names) strictly in ENGLISH.
Return ONLY JSON.`;
      } else {
        prompt = `你是一位来自${nationalityStr}的顶级本土厨师、美食家和职业生鲜买手，最懂家乡胃，深知你们国家老百姓平时怎么做这道菜。
食材：“${ingredientName}”。
返回纯JSON对象：
- "recipesFamiliar": (数组) 推荐1-2种在${nationalityStr}最地道、最常见的家常做法。注意：做法必须简单易学，是普通人稍微垫垫脚就能在家做出来的（无需复杂厨具和高难度技巧）。包含"recipeName"(字符串，做法名称)和"ingredientsNeeded"(字符串数组，需包含做这道菜常用的特色佐料。极其重要：1. 只需要提供食材种类名称，绝对不要包含数量或重量信息（例如只需“姜”，不要“老姜一大块”）；2. 绝对不要在这个数组里包含主食材“${ingredientName}”或其别名，因为它已经被单独列出)。
极其重要：无论输入的食材名称原本是什么语言，你都必须将所有的内容（包括菜谱名称、配料名称等）翻译并严格用【中文】输出。
只返回JSON。`;
      }
      messages = [ { role: 'user', content: prompt } ];
    }
    // --- STEP 2 Track B3: Local (文本生成：当地做法) ---
    else if (analyzeType === 'local') {
      if (!ingredientName) return { error: true, errorType: 'bad_request', message: 'Missing ingredientName' };
      
      let locStr = 'the user\'s current location';
      let cacheLocationKey = 'none';
      if (lang !== 'en') locStr = '用户当前所在地区';
      
      if (location) {
        if (location.nation && location.city) {
          if (lang === 'en') {
            locStr = `${location.city}, ${location.nation}`;
          } else {
            locStr = `${location.nation}${location.province && location.province !== location.city ? location.province : ''}${location.city}`;
          }
          cacheLocationKey = `${location.nation}_${location.city}`;
        } else if (location.lat && location.lng) {
          locStr = `(Lat: ${location.lat}, Lng: ${location.lng})`;
          cacheLocationKey = `${parseFloat(location.lat).toFixed(2)}_${parseFloat(location.lng).toFixed(2)}`;
        }
      }
      cacheKey = `llm_local_v2_${lang}_${cacheLocationKey}_${ingredientName}`;

      if (lang === 'en') {
        prompt = `You are a native chef, experienced gourmet, and local fresh market buyer living right here at ${locStr}. You know exactly how locals cook and eat in this specific region.
Ingredient: "${ingredientName}".
Return a pure JSON object:
- "recipesLocal": (Array) 1-2 local specialty recipes using this ingredient, exactly how locals make it here. The recipes MUST be simple and easy for a beginner to cook at home. Each object has "recipeName" (String) and "ingredientsNeeded" (Array of Strings, highlighting regional condiments. CRITICAL: 1. Provide ONLY ingredient names without any quantities or weights; 2. DO NOT include the main ingredient "${ingredientName}" in this array, as it's already added separately).
CRITICAL: Regardless of the language of the input ingredient name, you MUST translate and output ALL content (including recipe names and ingredient names) strictly in ENGLISH.
Return ONLY JSON.`;
      } else {
        prompt = `你是一位土生土长的本地厨师、美食家和职业生鲜买手，目前生活在 ${locStr}。你对这片土地上的饮食文化和当地人烹饪这道食材的习惯了如指掌。
食材：“${ingredientName}”。
返回纯JSON对象：
- "recipesLocal": (数组) 推荐1-2种这片区域当地人最常吃的特色做法。注意：做法必须接地气且简单易上手，是普通人稍微垫脚就能做出来的。包含"recipeName"(字符串，使用当地人的叫法)和"ingredientsNeeded"(字符串数组，需体现当地特色佐料。极其重要：1. 只需要提供食材种类名称，绝对不要包含数量或重量信息（例如只需“葱”，不要“小葱5根”）；2. 绝对不要在这个数组里包含主食材“${ingredientName}”或其别名，因为它已经被单独列出)。
极其重要：无论输入的食材名称原本是什么语言，你都必须将所有的内容（包括菜谱名称、配料名称等）翻译并严格用【中文】输出。
只返回JSON。`;
      }
      messages = [ { role: 'user', content: prompt } ];
    }

    if (cacheKey) {
      const cachedResult = await getCache(getMd5(cacheKey));
      if (cachedResult) {
        console.log(`[Analyze Step: ${analyzeType}] [Cache Hit] LLM Text:`, cacheKey);
        return cachedResult;
      }
    }

    // 发起大模型请求
    console.log(`\n=========================================`);
    console.log(`[Analyze Step: ${analyzeType}] === START ===`);
    console.log(`[Analyze Step: ${analyzeType}] INPUT PROMPT:\n${prompt}`);
    console.log(`[Analyze Step: ${analyzeType}] INPUT PARAMS: lang=${lang}, ingredientName=${ingredientName || 'N/A'}, nationality=${nationality || 'N/A'}, location=${JSON.stringify(location || 'N/A')}`);
    console.log(`=========================================\n`);

    let response;
    try {
      response = await axios.post(apiUrl, {
        model: modelName,
        messages: messages
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 60000 // 所有分析请求统一 60 秒超时
      });
    } catch (reqErr) {
      console.error(`\n=========================================`);
      console.error(`[Analyze Step: ${analyzeType}] === FAILED ===`);
      console.error(`[Analyze Step: ${analyzeType}] ERROR DETAILS:`, reqErr.message || reqErr);
      console.error(`=========================================\n`);
      throw reqErr; // 抛给外层的 catch
    }

    let content = response.data.choices[0].message.content;
    
    console.log(`\n=========================================`);
    console.log(`[Analyze Step: ${analyzeType}] === OUTPUT SUCCESS ===`);
    console.log(`[Analyze Step: ${analyzeType}] RAW OUTPUT:\n${content}`);
    console.log(`=========================================\n`);

    // 更稳健的 JSON 提取逻辑
    let cleanContent = content.trim();
    // 如果有 markdown 代码块，尝试提取内部内容
    const jsonMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) {
      cleanContent = jsonMatch[1].trim();
    } else {
      // 尝试找第一个 { 和最后一个 }
      const firstBrace = cleanContent.indexOf('{');
      const lastBrace = cleanContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanContent = cleanContent.substring(firstBrace, lastBrace + 1);
      }
    }

    let resultData;
    try {
      resultData = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error(`\n=========================================`);
      console.error(`[Analyze Step: ${analyzeType}] === JSON PARSE FAILED ===`);
      console.error(`[Analyze Step: ${analyzeType}] RAW OUTPUT WAS:\n`, content);
      console.error(`[Analyze Step: ${analyzeType}] CLEANED CONTENT WAS:\n`, cleanContent);
      console.error(`=========================================\n`);
      return { error: true, errorType: 'model_error', message: '模型返回格式异常' };
    }

    // 根据不同步骤格式化返回结果
    let finalResult = null;
    if (analyzeType === 'identify') {
      finalResult = {
        ingredientName: resultData.ingredientName || (lang === 'en' ? 'Unknown Ingredient' : '未知食材')
      };
    } else if (analyzeType === 'vision') {
      finalResult = {
        freshnessLevel: resultData.freshnessLevel || (lang === 'en' ? 'Unknown' : '未知'),
        freshnessReason: resultData.freshnessReason || (lang === 'en' ? 'Unable to recognize freshness reason' : '未能识别鲜度原因')
      };
    } else if (analyzeType === 'knowledge') {
      let cleanSimilar = resultData.similar || '';
      if (cleanSimilar) {
        cleanSimilar = cleanSimilar.replace(/^(类似[于]?|口感[像]?|像)/, '').trim();
      }
      finalResult = {
        ingredientDesc: resultData.ingredientDesc || (lang === 'en' ? 'No description' : '暂无描述'),
        taste: resultData.taste || '',
        texture: resultData.texture || '',
        similar: cleanSimilar,
      };
    } else if (analyzeType === 'familiar') {
      const fallbackFamiliar = [
        { recipeName: (lang === 'en' ? 'Simple Stir-fry' : '简单清炒'), ingredientsNeeded: (lang === 'en' ? ['Oil', 'Salt'] : ['油', '盐']) }
      ];
      let recipesFamiliar = resultData.recipesFamiliar;
      if (!Array.isArray(recipesFamiliar) || recipesFamiliar.length === 0) {
        recipesFamiliar = fallbackFamiliar;
      }
      finalResult = {
        recipesFamiliar: recipesFamiliar
      };
    } else if (analyzeType === 'local') {
      const fallbackLocal = [
        { recipeName: (lang === 'en' ? 'Local Specialty' : '当地特色做法'), ingredientsNeeded: (lang === 'en' ? ['Oil', 'Salt', 'Garlic'] : ['油', '盐', '蒜']) }
      ];
      let recipesLocal = resultData.recipesLocal;
      if (!Array.isArray(recipesLocal) || recipesLocal.length === 0) {
        recipesLocal = fallbackLocal;
      }
      finalResult = {
        recipesLocal: recipesLocal
      };
    }

    if (cacheKey && finalResult && !finalResult.error) {
      await setCache(getMd5(cacheKey), finalResult);
    }
    return finalResult;
    
  } catch (err) {
    console.error('模型请求失败:', err.message);
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return { error: true, errorType: 'timeout', message: '模型请求超时' };
    }
    return { error: true, errorType: 'model_error', message: err.message };
  }
}
