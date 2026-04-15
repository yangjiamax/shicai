const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ======= 🎯 配置区 =======
// 你昨天备份数据所在的文件夹
const BACKUP_DIR = path.join(__dirname, '../_archive/db_backup_0414');
// 处理后、准备导入测试环境的输出文件夹
const OUTPUT_DIR = path.join(__dirname, '../_archive/test_import_ready');
// 你的测试微信号的 OpenID（在微信开发者工具里能看到）
// ⚠️ 必须填你自己的 OpenID，否则导入测试环境后你在小程序里看不到数据！
const MY_TEST_OPENID = 'oRflEvq7zDEaPmICgDYEVIjucc-E'; // 替换成你自己的 OpenID
// =========================

async function processFile(inputPath, outputPath) {
  const fileStream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const outStream = fs.createWriteStream(outputPath);

  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      let doc = JSON.parse(line);
      
      // 1. 将数据归属权改成你的，方便在小程序中查看
      if (doc._openid) {
        doc._openid = MY_TEST_OPENID;
      }
      
      // 2. 如果有些集合有 creator 字段等，也可以一并替换
      // if (doc.creator) doc.creator = MY_TEST_OPENID;

      // 3. 删除原先的 _id（可选），导入云开发时会自动生成新的，避免跟线上库ID冲突引发混淆
      // 如果你想完全保持原样对应关系，可以保留。建议保留以便测试。
      
      outStream.write(JSON.stringify(doc) + '\n');
      count++;
    } catch (err) {
      console.error(`解析 JSON 失败: ${line}`, err);
    }
  }
  
  outStream.end();
  return count;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(BACKUP_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json') || f.includes('export'));

  if (jsonFiles.length === 0) {
    console.log(`❌ 在 ${BACKUP_DIR} 中没有找到备份文件。`);
    return;
  }

  console.log(`🚀 开始处理备份数据，将归属权转移给 OpenID: ${MY_TEST_OPENID}`);

  for (const file of jsonFiles) {
    const inputPath = path.join(BACKUP_DIR, file);
    // 给输出文件加上 .json 后缀，方便查看
    const outputPath = path.join(OUTPUT_DIR, `${file}_ready.json`);
    
    console.log(`⏳ 正在处理: ${file} ...`);
    const processedCount = await processFile(inputPath, outputPath);
    console.log(`✅ 完成！处理了 ${processedCount} 条数据 -> ${outputPath}`);
  }

  console.log(`\n🎉 全部处理完成！现在你可以去【微信开发者工具 -> 云开发 -> 数据库 -> 切换到 test 环境】，将 ${OUTPUT_DIR} 里的文件逐个导入了！`);
}

main().catch(console.error);
