const fs = require('fs');
const path = require('path');

function removeFallbacks(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      removeFallbacks(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.wxml')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      // match `|| '中文'` or `|| "中文"`
      const regexJs = /(app\.t\(['"][^'"]+['"]\))\s*\|\|\s*['"][^'"]+['"]/g;
      if (regexJs.test(content)) {
        content = content.replace(regexJs, '$1');
        changed = true;
      }
      
      const regexJs2 = /(this\.data\.i18n\.[a-zA-Z0-9_]+)\s*\|\|\s*['"][^'"]+['"]/g;
      if (regexJs2.test(content)) {
        content = content.replace(regexJs2, '$1');
        changed = true;
      }

      const regexWxml = /(i18n\.[a-zA-Z0-9_]+)\s*\|\|\s*['"][^'"]+['"]/g;
      if (regexWxml.test(content)) {
        content = content.replace(regexWxml, '$1');
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Removed fallbacks in ${fullPath}`);
      }
    }
  }
}

removeFallbacks(path.join(__dirname, 'miniprogram/pages'));