const axios = require('axios');

async function test() {
  const keyword = 'ham tomato sandwich';
  console.log('\nTesting YouTube Video Scraping directly...');
  try {
    const webRes = await axios.get('https://m.youtube.com/results', {
      params: {
        search_query: keyword
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    });
    
    const html = webRes.data;
    console.log('Status:', webRes.status);
    
    let results = [];
    const ytInitialDataMatch = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
    if (ytInitialDataMatch) {
       const ytData = JSON.parse(ytInitialDataMatch[1]);
       
       let contents = null;
       try {
           contents = ytData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
       } catch(e) {}
       
       if (!contents) {
           try {
               contents = ytData.contents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
           } catch(e) {}
       }
       
       if (contents && Array.isArray(contents)) {
           for (const item of contents) {
               const video = item.compactVideoRenderer || item.videoRenderer;
               if (video && video.videoId && results.length < 10) {
                   const url = 'https://www.youtube.com/watch?v=' + video.videoId;
                   const title = video.title?.runs?.[0]?.text || '';
                   const thumbnail = video.thumbnail?.thumbnails?.[0]?.url || '';
                   const viewCount = video.viewCountText?.simpleText || '';
                   
                   if (title && !results.find(r => r.url === url)) {
                       results.push({url, title, thumbnail, viewCount, source: 'youtube'});
                   }
               }
           }
       }
    }
    
    console.log('Final Results:', results.length);
    console.log(results.slice(0, 3));

  } catch(e) {
     console.error('Web Scraping Failed:', e.message);
  }
}

test();