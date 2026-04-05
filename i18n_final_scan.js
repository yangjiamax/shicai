const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'miniprogram/pages');

function hasChinese(str) {
  return /[\u4E00-\u9FA5]/.test(str);
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.wxml')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (hasChinese(line) && !line.trim().startsWith('//') && !line.trim().startsWith('<!--')) {
          // ignore console.log
          if (!line.includes('console.')) {
            console.log(`${fullPath}:${i+1}: ${line.trim()}`);
          }
        }
      }
    }
  }
}

scanDir(pagesDir);