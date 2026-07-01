// 现场提交前自检脚本：对 best_maze_design_组长名.json 做合法性检查
// （文件格式 / 起点终点 / 连通性 / 资源与陷阱设置 / BOSS 参数），
// 未通过会打印全部问题项并以非零状态码退出，便于在提交前先行修正。
//
// 用法：node server/scripts/checkSubmission.js <maze.json> [...更多文件]

import fs from 'node:fs';
import path from 'node:path';
import { checkSubmission } from '../algorithms/submissionCheck.js';

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.log('用法: node checkSubmission.js <best_maze_design_xxx.json> [...更多文件]');
    process.exit(1);
  }

  let allValid = true;
  for (const file of files) {
    console.log(`\n==== ${path.basename(file)} ====`);
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      console.log(`✗ JSON 解析失败：${error.message}`);
      allValid = false;
      continue;
    }
    const result = checkSubmission(payload);
    if (result.valid) {
      console.log('✓ 合法性检查通过');
    } else {
      console.log('✗ 合法性检查未通过：');
      for (const err of result.errors) console.log(`  - ${err}`);
      allValid = false;
    }
    if (result.warnings.length) {
      console.log('提示（不阻断提交，但建议关注）：');
      for (const warn of result.warnings) console.log(`  - ${warn}`);
    }
    if (result.summary) {
      console.log('概要:', JSON.stringify(result.summary));
    }
  }

  process.exit(allValid ? 0 : 1);
}

main();
