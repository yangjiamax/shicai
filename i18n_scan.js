const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'miniprogram/pages');

function scanAndReplace(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanAndReplace(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.wxml')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      // For now we just console.log the matched strings
      let match;
      const regexToast = /wx\.showToast\(\{\s*title:\s*(['"])([^'"]+)\1/g;
      while ((match = regexToast.exec(content)) !== null) {
        console.log(`[Toast] ${fullPath} : ${match[2]}`);
      }
      const regexLoading = /wx\.showLoading\(\{\s*title:\s*(['"])([^'"]+)\1/g;
      while ((match = regexLoading.exec(content)) !== null) {
        console.log(`[Loading] ${fullPath} : ${match[2]}`);
      }
      const regexModalTitle = /wx\.showModal\(\{\s*(?:[^}]*?\s*)?title:\s*(['"])([^'"]+)\1/g;
      while ((match = regexModalTitle.exec(content)) !== null) {
        console.log(`[Modal Title] ${fullPath} : ${match[2]}`);
      }
      const regexModalContent = /wx\.showModal\(\{\s*(?:[^}]*?\s*)?content:\s*(['"])([^'"]+)\1/g;
      while ((match = regexModalContent.exec(content)) !== null) {
        console.log(`[Modal Content] ${fullPath} : ${match[2]}`);
      }
    }
  }
}

scanAndReplace(pagesDir);