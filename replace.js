const fs = require('fs');
const path = require('path');

const dir = 'D:\\第二曲线\\识为鲜PinFresh';
const files = [
  'docs/mvp-prd.md',
  'docs/mvp-dev-plan-v2.md',
  'docs/mvp-dev-plan-beginner.md',
  'design/index-page.html',
  'miniprogram/pages/index/index.wxml',
  'miniprogram/app.json',
  'miniprogram/pages/index/index.json',
  'project.config.json',
  'design/login-page.html',
  'design/result-page.html',
  'design/shopping-list-page.html',
  'README.md',
  '.trae/rules/devrules.md'
];

files.forEach(file => {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      content = content.replace(/识材 SHI CAI/g, '知食公社');
      content = content.replace(/PinFresh-识材/g, '知食公社');
      content = content.replace(/PinFresh 识材/g, '知食公社');
      content = content.replace(/识为鲜 PinFresh｜识材/g, '知食公社');
      content = content.replace(/PinFresh/g, '知食公社');
      content = content.replace(/识为鲜/g, '知食公社');
      content = content.replace(/一眼识材/g, '一眼识菜');
      content = content.replace(/识材/g, '知食公社');
      
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Replaced in:', file);
  }
});
console.log('Replacement complete.');
