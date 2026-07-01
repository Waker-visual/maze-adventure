// 现场 BOSS 战验收脚本：读取一个或多个 boss_case_*.json（含 B / PlayerSkills），
// 用分支限界求解每个用例，打印并导出每场 BOSS 的最少回合与技能序列，
// 供直接把 "原始 BOSS 血量 + 玩家技能 + 生成的技能序列" 输入测试系统。
//
// 用法：
//   node server/scripts/runBossCases.js <case.json 或 目录> [...更多路径] [--out=结果目录]
//
// 示例：
//   node server/scripts/runBossCases.js "D:/课程/算法设计/迷宫组测试数据/Boss战测试样例" --out=./boss-results

import fs from 'node:fs';
import path from 'node:path';
import { solveBossGroup } from '../algorithms/bossSolver.js';

function collectJsonFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(input)) {
        if (name.toLowerCase().endsWith('.json')) files.push(path.join(input, name));
      }
    } else {
      files.push(input);
    }
  }
  return files;
}

function skillIndex(skillId) {
  return Number(skillId.split('-')[1]);
}

function printCase(filePath, group) {
  console.log(`\n==== ${path.basename(filePath)} ====`);
  const skills = group.bosses[0]?.skills ?? [];
  console.log(`PlayerSkills: ${JSON.stringify(skills.map((s) => [s.damage, s.cooldown]))}`);
  if (!group.hasNoCooldownSkill) {
    console.log('⚠ 警告：技能集合缺少无冷却技能');
  }
  for (const boss of group.bosses) {
    if (boss.minTurns == null) {
      console.log(`BOSS${boss.bossIndex + 1} (HP=${boss.hp}): 未找到可行方案（超出搜索上限）`);
      continue;
    }
    const indices = boss.bestSequence.map(skillIndex);
    console.log(`BOSS${boss.bossIndex + 1} (HP=${boss.hp}): 最少 ${boss.minTurns} 回合`);
    console.log(`  技能序列（索引，从1开始）: [${indices.join(', ')}]`);
    console.log(`  技能序列（ID）: ${boss.bestSequence.join(' -> ')}`);
  }
  console.log(`本用例合计最少回合数: ${group.minTurns}`);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('用法: node runBossCases.js <boss_case.json 或 目录> [...更多路径] [--out=结果目录]');
    process.exit(1);
  }
  const outArg = args.find((a) => a.startsWith('--out='));
  const outDir = outArg ? outArg.slice('--out='.length) : null;
  const inputs = args.filter((a) => !a.startsWith('--'));
  const files = collectJsonFiles(inputs);
  if (!files.length) {
    console.log('未找到任何 JSON 用例文件。');
    process.exit(1);
  }
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const allResults = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const group = solveBossGroup(raw);
    printCase(file, group);
    const result = {
      source: path.basename(file),
      B: raw.B,
      PlayerSkills: raw.PlayerSkills,
      minTurns: group.minTurns,
      hasNoCooldownSkill: group.hasNoCooldownSkill,
      bosses: group.bosses.map((boss) => ({
        bossIndex: boss.bossIndex,
        hp: boss.hp,
        minTurns: boss.minTurns,
        sequenceSkillIndices: boss.minTurns == null ? [] : boss.bestSequence.map(skillIndex),
        sequenceIds: boss.bestSequence
      }))
    };
    allResults.push(result);
    if (outDir) {
      const outPath = path.join(outDir, `${path.basename(file, path.extname(file))}.result.json`);
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
      console.log(`  -> 已写入 ${outPath}`);
    }
  }

  console.log(`\n共处理 ${allResults.length} 个用例。`);
}

main();
