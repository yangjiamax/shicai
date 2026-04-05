const axios = require('axios');

async function test() {
  const keyword = 'ham tomato sandwich';
  console.log('\nTesting direct Food.com web scraping through html regexes ...');
  try {
    const webRes = await axios.get('https://www.food.com/search/' + encodeURIComponent(keyword), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    });
    
    const html = webRes.data;
    console.log('Status:', webRes.status);
    console.log('HTML length:', html.length);
    
    let foodcomResults = [];
    
    // <div class="tile-content"> ... <h2 class="title">...</h2> ... <a href="https://www.food.com/recipe/...">
    // Food.com DOM structure matching
    const recipeBlockRegex = /<h2 class="title"([\s\S]*?)<\/h2>/gi;
    let match;
    
    while ((match = recipeBlockRegex.exec(html)) !== null && foodcomResults.length < 10) {
      const block = match[1];
      const titleMatch = block.match(/>([^<]+)</);
      const urlMatch = html.substring(match.index - 500, match.index).match(/href=["'](https:\/\/www\.food\.com\/recipe\/[^"']+)["']/i);
      
      if (titleMatch && urlMatch) {
         const title = titleMatch[1].trim();
         const url = urlMatch[1];
         
         // extract image near it
         const imgBlock = html.substring(match.index, match.index + 1000);
         const imgMatch = imgBlock.match(/<img[^>]+src=["']([^"']+)["']/i) || imgBlock.match(/<img[^>]+data-src=["']([^"']+)["']/i);
         const img = imgMatch ? imgMatch[1] : 'https://www.food.com/favicon.ico';
         
         if (title && !foodcomResults.find(r => r.url === url)) {
             foodcomResults.push({url, title: title.replace(/&amp;/g, '&').replace(/&#39;/g, "'"), thumbnail: img, source: 'foodcom'});
         }
      }
    }
    
    // Fallback: look for script type="application/ld+json" which is excellent for SEO/recipes
    if (foodcomResults.length === 0) {
        console.log("Regex failed. Trying ld+json extraction...");
        const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
        let ldMatch;
        while ((ldMatch = jsonLdRegex.exec(html)) !== null && foodcomResults.length < 10) {
            try {
                const ldData = JSON.parse(ldMatch[1]);
                const recipes = Array.isArray(ldData) ? ldData : (ldData['@graph'] || [ldData]);
                
                for (const item of recipes) {
                    // Check if ItemList containing Recipes
                    if (item['@type'] === 'ItemList' && item.itemListElement) {
                        for (const el of item.itemListElement) {
                            if (el.url && el.url.includes('/recipe/') && foodcomResults.length < 10) {
                                foodcomResults.push({
                                    url: el.url,
                                    title: el.name || 'Recipe',
                                    thumbnail: el.image || 'https://www.food.com/favicon.ico',
                                    source: 'foodcom'
                                });
                            }
                        }
                    } else if (item['@type'] === 'Recipe' && item.url && foodcomResults.length < 10) {
                        foodcomResults.push({
                            url: item.url,
                            title: item.name || 'Recipe',
                            thumbnail: (Array.isArray(item.image) ? item.image[0] : item.image) || 'https://www.food.com/favicon.ico',
                            source: 'foodcom'
                        });
                    }
                }
            } catch(e) {}
        }
    }
    
    console.log('Final Results:', foodcomResults.length);
    console.log(foodcomResults);

  } catch(e) {
     console.error('Web Scraping Failed:', e.message);
  }
}

test();