const axios = require('axios');

async function test() {
  try {
    const xcfRes = await axios.get('https://www.xiachufang.com/search/', {
      params: { keyword: '清蒸青蟹' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    
    const html = xcfRes.data;
    
    let xiachufangResults = [];
    
    // Lowercase matching just in case
    const simpleRegex = /<p class="name">\s*<a href="(\/recipe\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = simpleRegex.exec(html)) !== null && xiachufangResults.length < 10) {
      xiachufangResults.push({
        thumbnail: 'https://i2.chuimg.com/logo/xiachufang.png',
        url: 'https://www.xiachufang.com' + match[1],
        title: match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        source: 'xiachufang'
      });
    }
    
    // Look closely at the html structure around the cover
    // It's often <div class="cover"> ... <img src="..." ...>
    const imgBlockRegex = /<a href="(\/recipe\/\d+\/)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/g;
    let imgMatch;
    while ((imgMatch = imgBlockRegex.exec(html)) !== null) {
      const recipeUrl = 'https://www.xiachufang.com' + imgMatch[1];
      const imgUrl = imgMatch[2].split('?')[0];
      const item = xiachufangResults.find(r => r.url === recipeUrl);
      if (item && imgUrl.startsWith('http')) {
        item.thumbnail = imgUrl;
      }
    }

    const dataImgBlockRegex = /<a href="(\/recipe\/\d+\/)"[^>]*>[\s\S]*?<img[^>]+data-src="([^"]+)"/g;
    while ((imgMatch = dataImgBlockRegex.exec(html)) !== null) {
      const recipeUrl = 'https://www.xiachufang.com' + imgMatch[1];
      const imgUrl = imgMatch[2].split('?')[0];
      const item = xiachufangResults.find(r => r.url === recipeUrl);
      if (item && imgUrl.startsWith('http')) {
        item.thumbnail = imgUrl;
      }
    }
    
    console.log(JSON.stringify(xiachufangResults, null, 2));
    
  } catch (err) {
    console.error('下厨房搜索失败:', err.message);
  }
}
test();