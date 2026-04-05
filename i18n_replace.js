const fs = require('fs');
const path = require('path');

const i18nKeys = {
  // history-list/index.js
  '加载失败': { key: 'err_load_failed', en: 'Failed to load' },
  '添加失败': { key: 'err_add_failed', en: 'Failed to add' },
  '全部食材已加入当前清单': { key: 'list_all_added', en: 'All ingredients added to list' },
  '已收藏过该食谱': { key: 'recipe_saved_already', en: 'Recipe already saved' },
  '已收藏至宝藏食谱': { key: 'recipe_saved_success', en: 'Saved to favorite recipes' },
  '收藏失败': { key: 'recipe_save_failed', en: 'Failed to save' },
  '添加中...': { key: 'recipe_adding', en: 'Adding...' },
  '正在收藏...': { key: 'recipe_saving', en: 'Saving...' },

  // index/index.js
  '请向左或向右滑动': { key: 'index_swipe_hint', en: 'Please swipe left or right' },
  '请输入食材内容': { key: 'index_input_empty', en: 'Please enter ingredients' },
  '未能识别到语音内容': { key: 'index_voice_empty', en: 'Failed to recognize voice' },
  '未能识别到食材': { key: 'index_voice_no_ingredient', en: 'No ingredients recognized' },
  '录音失败: ': { key: 'index_record_failed', en: 'Recording failed: ' },
  '添加成功': { key: 'index_add_success', en: 'Added successfully' },

  // list/index.js
  '如需修改或删除，请切换至“逐道菜选购”操作': { key: 'list_edit_hint', en: 'Please switch to "By Recipe" to edit or delete' },
  '已收藏': { key: 'list_saved', en: 'Saved' },
  '已存在该菜谱': { key: 'list_recipe_exists', en: 'Recipe already exists' },
  '保存中...': { key: 'list_saving', en: 'Saving...' },
  '删除食材': { key: 'list_delete_ingredient', en: 'Delete Ingredient' },
  '删除整道菜': { key: 'list_delete_recipe', en: 'Delete Recipe' },
  '智能合并提示': { key: 'list_merge_hint', en: 'Smart Merge' },
  '确认删除？': { key: 'list_confirm_delete', en: 'Are you sure to delete?' },

  // my/index.js
  '未选中任何项': { key: 'my_no_selection', en: 'No items selected' },
  '已删除': { key: 'my_deleted', en: 'Deleted' },
  '删除失败': { key: 'my_delete_failed', en: 'Failed to delete' },
  '菜谱不支持重命名': { key: 'my_rename_unsupported', en: 'Recipe renaming not supported' },
  '修改成功': { key: 'my_modify_success', en: 'Modified successfully' },
  '修改失败': { key: 'my_modify_failed', en: 'Failed to modify' },
  '微信版本过低不支持该功能': { key: 'my_wx_version_low', en: 'WeChat version too low' },
  '删除中...': { key: 'my_deleting', en: 'Deleting...' },
  '批量删除': { key: 'my_batch_delete', en: 'Batch Delete' },
  '清空记录': { key: 'my_clear_records', en: 'Clear Records' },

  // onboarding/index.js
  '权限提示': { key: 'onboarding_auth_hint', en: 'Permission Request' },
  '需要授权才能推荐当地特色菜谱，是否前往设置？': { key: 'onboarding_auth_location_desc', en: 'Location permission needed for local recipes. Go to settings?' },
  '需要麦克风权限才能使用语音录入，是否前往设置？': { key: 'onboarding_auth_record_desc', en: 'Microphone permission needed for voice input. Go to settings?' }
};

function updateJsFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const [zhStr, info] of Object.entries(i18nKeys)) {
    // Escape special chars in zhStr
    const escapedZh = zhStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // replace wx.showToast({ title: 'xxx' }) -> wx.showToast({ title: app.t('key') })
    const regexToast = new RegExp(`title:\\s*['"]${escapedZh}['"]`, 'g');
    if (regexToast.test(content)) {
      content = content.replace(regexToast, `title: app.t('${info.key}')`);
      changed = true;
    }
    
    // For string concatenation like '录音失败: ' + errMsg
    const regexToastConcat = new RegExp(`title:\\s*['"]${escapedZh}['"]\\s*\\+`, 'g');
    if (regexToastConcat.test(content)) {
      content = content.replace(regexToastConcat, `title: app.t('${info.key}') +`);
      changed = true;
    }

    const regexContent = new RegExp(`content:\\s*['"]${escapedZh}['"]`, 'g');
    if (regexContent.test(content)) {
      content = content.replace(regexContent, `content: app.t('${info.key}')`);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

const pagesDir = path.join(__dirname, 'miniprogram/pages');
function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.js')) {
      updateJsFile(fullPath);
    }
  }
}

scanDir(pagesDir);

// Update zh.js and en.js
const zhPath = path.join(__dirname, 'miniprogram/utils/zh.js');
const enPath = path.join(__dirname, 'miniprogram/utils/en.js');

let zhContent = fs.readFileSync(zhPath, 'utf8');
let enContent = fs.readFileSync(enPath, 'utf8');

let newZh = '';
let newEn = '';

for (const [zhStr, info] of Object.entries(i18nKeys)) {
  if (!zhContent.includes(`${info.key}:`)) {
    newZh += `  ${info.key}: '${zhStr}',\n`;
  }
  if (!enContent.includes(`${info.key}:`)) {
    newEn += `  ${info.key}: '${info.en}',\n`;
  }
}

if (newZh) {
  zhContent = zhContent.replace('// 其他\n', `// 动态添加的翻译\n${newZh}\n  // 其他\n`);
  fs.writeFileSync(zhPath, zhContent, 'utf8');
  console.log('Updated zh.js');
}

if (newEn) {
  enContent = enContent.replace('// Others\n', `// Dynamically added translations\n${newEn}\n  // Others\n`);
  fs.writeFileSync(enPath, enContent, 'utf8');
  console.log('Updated en.js');
}
