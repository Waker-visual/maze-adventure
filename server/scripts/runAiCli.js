// AI 玩家现场验收脚本：加载一个"不含 BOSS 血量"的迷宫 JSON，AI 走到 BOSS
// 格子时通过键盘依次输入当前 BOSS 血量，每次一个，输入 -1 表示该迷宫的
// BOSS 输入结束；随后完成整场探险并输出验收核心指标
// （到达终点剩余金币数 / 移动步数，若失败记为 0）。
//
// 用法：node server/scripts/runAiCli.js <maze.json> [--strategy=greedy|optimal|speedrun]

import fs from 'node:fs';
import readline from 'node:readline';
import { simulateAi, AI_STRATEGIES } from '../algorithms/aiPlayer.js';
import { BOSS, findCells, normalizeMaze } from '../algorithms/mazeUtils.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const strategyArg = args.find((a) => a.startsWith('--strategy='));
  const strategy = strategyArg ? strategyArg.slice('--strategy='.length) : 'greedy';
  return { file, strategy };
}

function askBossHp(rl) {
  return new Promise((resolve) => {
    const values = [];
    const next = () => {
      rl.question(`请输入 BOSS 血量（第 ${values.length + 1} 个，输入 -1 结束）: `, (answer) => {
        const value = Number(String(answer).trim());
        if (!Number.isFinite(value)) {
          console.log('请输入数字。');
          next();
          return;
        }
        if (value === -1) {
          resolve(values);
          return;
        }
        if (value <= 0) {
          console.log('BOSS 血量必须为正数。');
          next();
          return;
        }
        values.push(value);
        next();
      });
    };
    next();
  });
}

async function main() {
  const { file, strategy } = parseArgs();
  if (!file) {
    console.log('用法: node runAiCli.js <maze.json> [--strategy=greedy|optimal|speedrun]');
    process.exit(1);
  }
  if (!AI_STRATEGIES.some((s) => s.key === strategy)) {
    console.log(`未知策略 ${strategy}，可选：${AI_STRATEGIES.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const maze = normalizeMaze(payload.maze ?? payload);
  const bossCells = findCells(maze, BOSS);

  let bossHp = [];
  if (bossCells.length) {
    console.log(`检测到迷宫中有 ${bossCells.length} 个 BOSS 格子，本次迷宫数据不含 BOSS 血量。`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    bossHp = await askBossHp(rl);
    rl.close();
    console.log(`已录入 BOSS 血量序列: [${bossHp.join(', ')}]`);
  } else {
    console.log('迷宫中没有 BOSS 格子，跳过 BOSS 血量输入。');
  }

  const result = simulateAi({ ...payload, maze, B: bossHp, strategy });

  console.log('\n==== AI 玩家探险结果 ====');
  console.log(`策略: ${strategy}`);
  console.log(`是否到达终点: ${result.success ? '是' : '否'}`);
  console.log(`移动步数: ${result.steps}`);
  console.log(`剩余金币（资源）数: ${result.remainingResource}`);
  console.log(`验收指标（剩余资源/步数，失败记 0）: ${result.scoreRatio}`);
  console.log(`拾取金币数: ${result.coinsCollected}，触发陷阱数: ${result.trapsTriggered}`);

  const bossEvent = result.events.find((event) => event.type === 'boss');
  if (bossEvent) {
    console.log(`BOSS 战结果: ${bossEvent.result}，最少回合 ${bossEvent.minTurns}（限定 ${bossEvent.turnLimit}）`);
  }
}

main();
