import test from 'node:test';
import assert from 'node:assert/strict';
import sample from '../data/maze_15_15.json' with { type: 'json' };
import { generateMaze, validateMaze, compareGenerators } from '../algorithms/mazeGenerator.js';
import { solveResourcePath, solveResourceCollectOnly, verifyResourceMaximization } from '../algorithms/resourceDp.js';
import { normalizeSkills, solveBossGroup, simulateBossBattle } from '../algorithms/bossSolver.js';
import { simulateAi, AI_STRATEGIES } from '../algorithms/aiPlayer.js';
import { evaluateGreedy, greedyStep, runGreedyCase, defaultGreedyCases } from '../algorithms/greedyVision.js';
import { runCrossTest } from '../algorithms/crossTest.js';
import { checkSubmission } from '../algorithms/submissionCheck.js';

const ALGORITHMS = ['dfs', 'prim', 'divide', 'branch'];

test('sample maze validates basic structure', () => {
  const result = validateMaze(sample.maze);
  assert.equal(result.rectangular, true);
  assert.equal(result.startCount, 1);
  assert.equal(result.endCount, 1);
  assert.equal(result.connected, true);
});

// 多用例：四种算法在多个尺寸下都必须生成连通且唯一通路的完美迷宫。
for (const algorithm of ALGORITHMS) {
  for (const size of [11, 15, 21]) {
    test(`generator ${algorithm} @${size} is a perfect maze`, () => {
      const result = generateMaze({ size, algorithm, coinCount: 6, trapCount: 3 });
      assert.equal(result.validation.connected, true, 'must be connected');
      assert.equal(result.validation.uniquePath, true, 'must have unique path');
      assert.equal(result.validation.startCount, 1);
      assert.equal(result.validation.endCount, 1);
    });
  }
}

test('seeded generation is reproducible', () => {
  const a = generateMaze({ size: 15, algorithm: 'dfs', seed: 'exam-2026' });
  const b = generateMaze({ size: 15, algorithm: 'dfs', seed: 'exam-2026' });
  assert.deepEqual(a.maze, b.maze);
});

test('compareGenerators reports all four paradigms with complexity info', () => {
  const result = compareGenerators({ size: 15, rounds: 2, seed: 'cmp' });
  assert.equal(result.results.length, 4);
  for (const row of result.results) {
    assert.ok(row.info, `${row.algorithm} must carry complexity info`);
    assert.ok(typeof row.avgTimeMs === 'number');
    assert.equal(row.connectedRate, 1);
  }
});

// 多用例：DP 资源路径在多个迷宫上都能给出数值结果与展开路径。
const dpCases = [sample.maze, generateMaze({ size: 13, algorithm: 'prim', seed: 'dp1' }).maze];
for (const [index, maze] of dpCases.entries()) {
  test(`resource dp returns optimal value & path (case ${index + 1})`, () => {
    const result = solveResourcePath(maze);
    assert.equal(typeof result.maxResource, 'number');
    assert.ok(Array.isArray(result.expandedPath));
    assert.ok(Array.isArray(result.resourcePath));
    assert.ok(Array.isArray(result.dpStates));
  });
}

// 回归用例：来自课程测试样例 maze_15_15_1.json，曾经暴露过一个真实 bug——
// 分支点退回上一层时，代码把整段子路径（包含子路径内部自己的"进去再退回"）直接反转当作回程，
// 导致子路径内部已经走过的岔路被当成回程重新整段走一遍，一枚金币因此被吃了两次。
// 现改为沿树上父指针从子路径终点直接走回分支点，不再重放子路径内部的详细过程。
test('resource dp never revisits the same coin twice (regression: naive path reversal bug)', () => {
  const maze = [
    ['#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#'],
    ['#', ' ', ' ', ' ', '#', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '#'],
    ['#', ' ', '#', ' ', '#', ' ', '#', '#', '#', '#', '#', ' ', '#', ' ', '#'],
    ['#', ' ', '#', ' ', ' ', 'T', ' ', 'G', '#', 'G', ' ', ' ', '#', ' ', '#'],
    ['#', '#', '#', '#', '#', 'T', '#', '#', '#', '#', '#', '#', '#', '#', '#'],
    ['#', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '#', 'G', ' ', ' ', 'G', ' ', '#'],
    ['#', ' ', '#', '#', '#', ' ', '#', '#', '#', ' ', '#', '#', '#', '#', '#'],
    ['S', ' ', '#', ' ', ' ', 'B', '#', ' ', '#', ' ', ' ', ' ', '#', ' ', '#'],
    ['#', ' ', '#', '#', '#', ' ', '#', ' ', '#', ' ', '#', ' ', '#', ' ', '#'],
    ['#', ' ', '#', 'T', ' ', ' ', ' ', ' ', 'T', ' ', '#', ' ', ' ', ' ', '#'],
    ['#', ' ', '#', '#', '#', ' ', '#', '#', '#', '#', '#', ' ', '#', '#', '#'],
    ['#', ' ', '#', ' ', ' ', ' ', ' ', ' ', ' ', '#', ' ', ' ', ' ', ' ', '#'],
    ['#', '#', '#', '#', '#', ' ', '#', '#', '#', ' ', '#', '#', '#', ' ', '#'],
    ['#', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '#', ' ', '#', ' ', ' ', ' ', '#'],
    ['#', '#', '#', '#', 'E', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#']
  ];
  const result = solveResourcePath(maze);
  assert.equal(result.maxResource, 110);

  const coinVisits = new Map();
  for (const pos of result.expandedPath) {
    if (maze[pos.row][pos.col] !== 'G') continue;
    const k = `${pos.row},${pos.col}`;
    coinVisits.set(k, (coinVisits.get(k) ?? 0) + 1);
  }
  for (const [cellKey, count] of coinVisits) {
    assert.equal(count, 1, `coin at ${cellKey} should only be walked over once, got ${count}`);
  }
});

test('resource dp prefers coins over traps (never negative optimum here)', () => {
  const result = solveResourcePath(sample.maze);
  assert.ok(result.maxResource >= 0, 'optimal resource should not be negative');
});

// 资源收集测试：不要求回到终点，收集完当前已知最优资源即可停止，并报告路径长度。
test('resource collect-only DP stops after collecting resources instead of routing back to E', () => {
  const maze = [
    ['S', ' ', 'G', ' ', 'E'],
    [' ', '#', ' ', '#', ' '],
    ['G', ' ', ' ', ' ', 'G'],
    [' ', '#', ' ', '#', ' '],
    ['T', ' ', ' ', ' ', 'T']
  ];
  const result = solveResourceCollectOnly(maze);
  assert.equal(result.maxResource, 150, 'should collect all 3 coins and skip both traps');
  assert.equal(result.resourcePath.length, 3);
  assert.equal(typeof result.pathLength, 'number');
  assert.ok(result.pathLength > 0);
  const last = result.expandedPath[result.expandedPath.length - 1];
  const lastResource = result.resourcePath[result.resourcePath.length - 1];
  assert.equal(last.row, lastResource.row, 'path should end at the last collected resource, not be forced onward to E');
  assert.equal(last.col, lastResource.col);
});

// 自由起点：出发点可任选迷宫内任意可通行格，不必从 S 出发。当到金币必须穿过净收益为负的
// 陷阱走廊时，固定从 S 出发只能放弃（=0），而自由起点可以直接从金币处开始采集。
test('resource collect-only lets the start be freely chosen for a higher optimum', () => {
  const maze = [
    ['#', '#', '#', '#', '#', '#', '#', '#'],
    ['#', 'S', ' ', 'T', 'T', 'T', 'G', '#'],
    ['#', '#', '#', '#', '#', '#', '#', '#']
  ];
  const sRooted = solveResourcePath(maze);          // 固定从 S 出发（AI 玩家用，保持不变）
  const free = solveResourceCollectOnly(maze);        // 自由起点（资源收集测试用）
  assert.equal(sRooted.maxResource, 0, 'from S the trap corridor makes collecting the coin net-negative');
  assert.equal(free.maxResource, 50, 'free start can begin at the coin and collect it directly');
  assert.deepEqual(free.start, { row: 1, col: 6 }, 'chosen optimal start is the coin cell');

  const verify = verifyResourceMaximization(maze);
  assert.equal(verify.bruteForceValue, 50);
  assert.equal(verify.isMaximal, true);
});

// 起点不设奖励且资源收集路径不经过起点 S；同时不应把通往终点/死胡同的价值为 0 的走廊算进采集路径。
// 用例来自课程样例 maze_7_7：S 在底部、E 在顶部，两枚金币在右侧。曾出现路径从 E 出发绕一段空走廊
// （价值 0）再采集，白白变长；也曾因并列 down 把 apex 定在 S 上导致路径经过起点。
test('resource collect-only path never steps on the start S and skips value-0 dead-end corridors', () => {
  const maze = [
    ['#', '#', '#', '#', '#', 'E', '#'],
    ['#', 'T', 'T', 'B', ' ', ' ', '#'],
    ['#', ' ', '#', ' ', '#', '#', '#'],
    ['#', ' ', '#', ' ', ' ', 'G', '#'],
    ['#', 'G', '#', ' ', '#', '#', '#'],
    ['#', 'T', '#', ' ', ' ', 'G', '#'],
    ['#', '#', '#', '#', 'S', '#', '#']
  ];
  const result = solveResourceCollectOnly(maze);
  assert.equal(result.maxResource, 100, 'best is the two right-side coins');

  const onStart = result.expandedPath.some((p) => p.row === 6 && p.col === 4);
  assert.equal(onStart, false, 'the resource-collection path must not pass through the start cell S');

  // 首尾格都应是金币（起点不设奖励、也不绕价值为 0 的死胡同）。
  const first = result.expandedPath[0];
  const last = result.expandedPath[result.expandedPath.length - 1];
  assert.equal(maze[first.row][first.col], 'G', 'path should start on a coin, not a value-0 corridor cell');
  assert.equal(maze[last.row][last.col], 'G', 'path should end on a coin, not a value-0 corridor cell');
  // 不应踏入终点 E 或其上方的死胡同走廊（(0,5)E / (1,4) / (1,5)）。
  assert.equal(result.expandedPath.some((p) => p.row === 0 && p.col === 5), false, 'path should not detour to E');
});

// 独立暴力穷举与 DP 交叉验证：确认 DP 输出的资源值确实是可达范围内的最大值。
test('verifyResourceMaximization confirms DP result matches brute force on a small maze', () => {
  const maze = [
    ['S', ' ', 'G', ' ', 'E'],
    [' ', '#', ' ', '#', ' '],
    ['G', ' ', ' ', ' ', 'G'],
    [' ', '#', ' ', '#', ' '],
    ['T', ' ', ' ', ' ', 'T']
  ];
  const result = verifyResourceMaximization(maze);
  assert.equal(result.bruteForceValue, result.maxResource);
  assert.equal(result.isMaximal, true);
});

test('verifyResourceMaximization skips brute force and explains why beyond the cap', () => {
  const result = verifyResourceMaximization(sample.maze, { bruteForceCap: 1 });
  assert.equal(result.isMaximal, null);
  assert.equal(result.bruteForceValue, null);
  assert.ok(result.verifyMethod.includes('超过穷举验证上限'));
});

// 多用例：BOSS 战在不同血量组上都能给出有限最少回合数与技能序列。
const bossCases = [[11, 13, 9, 15], [20], [5, 5, 5]];
for (const [index, B] of bossCases.entries()) {
  test(`boss solver finds finite plan (case ${index + 1})`, () => {
    const result = solveBossGroup({ ...sample, B });
    assert.ok(result.minTurns > 0);
    assert.ok(result.bestSequence.length > 0);
    assert.equal(result.hasNoCooldownSkill, true);
  });
}

// 回归用例：来自课程测试样例 boss_case_4，曾暴露真实 bug——以前逐个 BOSS 各自取最少回合、
// 再把该序列产生的冷却状态硬塞给下一个 BOSS，忽略了"当前 BOSS 换一条同样最少回合的序列，
// 能给后续 BOSS 留下更好的冷却"，导致【总】回合数不是全局最优。全局链式搜索后总回合应为 11。
test('boss group finds globally optimal total turns across the cooldown chain (regression: boss_case_4)', () => {
  const input = { B: [20, 10, 20], PlayerSkills: [[1, 0], [9, 4], [10, 5]] };
  const result = solveBossGroup(input);
  assert.equal(result.minTurns, 11, 'global optimum is 11 total turns, not the greedy-per-boss 13');

  // 逐个技能回放，确认每次使用时技能确实不在冷却中，且每个 BOSS 都被打死（序列必须合法可执行）。
  const skills = input.PlayerSkills.map((s) => ({ damage: s[0], cooldown: s[1] }));
  let cd = skills.map(() => 0);
  for (const boss of result.bosses) {
    let hp = boss.hp;
    for (const sid of boss.bestSequence) {
      const idx = Number(sid.split('-')[1]) - 1;
      assert.equal(cd[idx], 0, `skill ${sid} must be off cooldown when used`);
      cd = cd.map((v) => Math.max(0, v - 1));
      cd[idx] = skills[idx].cooldown;
      hp -= skills[idx].damage;
    }
    assert.ok(hp <= 0, `BOSS ${boss.bossIndex + 1} must actually be defeated`);
  }
});

test('boss battle clears with enough coins and reports rounds', () => {
  const result = simulateBossBattle({ ...sample, coins: 100 });
  assert.equal(typeof result.cleared, 'boolean');
  assert.ok(result.totalRounds > 0);
  assert.ok(Array.isArray(result.log));
});

test('boss battle triggers GAME OVER when coins run out', () => {
  // 可击败但需 15 回合 (伤害2) > 限定 5 回合，且零金币无法复活 → 必然 GAME OVER。
  const result = simulateBossBattle({ B: [30], PlayerSkills: [[2, 0]], minRouds: 5, CoinConsumption: 5, coins: 0 });
  assert.equal(result.gameOver, true);
  assert.equal(result.cleared, false);
  assert.ok(result.log.some((e) => e.event === 'game-over'));
});

test('boss battle revives with coins then clears an over-limit boss', () => {
  // 同样 15 回合 > 限定 5，但金币充足，应复活两次后击败。
  const result = simulateBossBattle({ B: [30], PlayerSkills: [[2, 0]], minRouds: 5, CoinConsumption: 5, coins: 50 });
  assert.equal(result.cleared, true);
  assert.ok(result.revives >= 2);
  assert.ok(result.log.some((e) => e.event === 'defeated'));
});

test('boss solver warns when no zero-cooldown skill is provided', () => {
  const result = solveBossGroup({ B: [10], PlayerSkills: [[10, 2]] });
  assert.equal(result.hasNoCooldownSkill, false);
  assert.ok(result.warning);
});

test('skills carry no normal/ultimate naming, only uniform names', () => {
  const skills = normalizeSkills([[8, 4], [2, 0], [4, 2]]);
  assert.deepEqual(skills.map((s) => s.name), ['技能1', '技能2', '技能3']);
});

// 冷却在同一 B[] 组内的连续 BOSS 之间继承（课程 Q&A 明确要求），
// 而不是每场重置为 0。构造技能组合让继承与不继承产生不同的最少回合数，
// 以此验证 solveBossGroup 确实在链式传递冷却状态。
test('boss cooldowns inherit across sequential bosses within a group', () => {
  const skills = [[10, 3], [1, 0]];
  const chained = solveBossGroup({ B: [10, 10], PlayerSkills: skills });
  const independentBoss2 = solveBossGroup({ B: [10], PlayerSkills: skills }).minTurns;

  // 若冷却继承生效，第二个 BOSS 在技能1仍处于冷却时无法立即秒杀，
  // 总回合数应严格大于"两场都从冷却清零开始"的理论值。
  assert.equal(chained.bosses[0].minTurns, 1);
  assert.ok(chained.bosses[1].minTurns > independentBoss2, 'second boss must be slower due to inherited cooldown');
  assert.equal(chained.minTurns, chained.bosses[0].minTurns + chained.bosses[1].minTurns);
});

test('checkSubmission accepts a fully valid 15x15 submission', () => {
  const result = checkSubmission(sample);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.hasNoCooldownSkill, true);
});

test('checkSubmission rejects missing zero-cooldown skill and wrong size', () => {
  const badMaze = sample.maze.slice(0, 9).map((row) => row.slice(0, 9));
  const result = checkSubmission({ ...sample, maze: badMaze, PlayerSkills: [[5, 2], [3, 1]] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('无冷却技能')));
  assert.ok(result.errors.some((e) => e.includes('15x15')));
});

// 多用例：贪心 3×3 局部拾取评测，给出每步均值与多用例均值。
test('greedy benchmark averages over multiple 3x3 cases', () => {
  const result = evaluateGreedy({ cases: defaultGreedyCases() });
  assert.equal(result.caseCount, defaultGreedyCases().length);
  assert.equal(typeof result.meanPickedValue, 'number');
  assert.equal(typeof result.meanPerStepValue, 'number');
  for (const c of result.results) {
    assert.ok(Array.isArray(c.trace) && c.trace.length >= 1);
  }
});

test('greedy picks highest cost-performance coin and avoids traps', () => {
  const maze = [
    ['G', ' ', 'G'],
    [' ', 'T', ' '],
    [' ', ' ', 'G']
  ];
  const step = greedyStep(maze, { row: 1, col: 0 });
  assert.ok(step.target, 'should target a coin in vision');
  assert.equal(step.target.type, 'G');
  const run = runGreedyCase(maze, { row: 1, col: 0 });
  assert.ok(run.coinsPicked >= 1);
});

// 验收核心指标：若游戏失败（未到达终点）比值必须记为 0，即使沿途已拾取金币、步数 > 0。
test('ai scoreRatio is forced to 0 when the run fails to reach the end', () => {
  const maze = [
    ['S', 'G', '#'],
    ['#', '#', '#'],
    ['#', '#', 'E']
  ];
  const result = simulateAi({ maze, strategy: 'greedy' });
  assert.equal(result.success, false);
  assert.ok(result.steps > 0, 'should have moved to collect the coin before getting stuck');
  assert.ok(result.remainingResource > 0, 'should have picked up the coin');
  assert.equal(result.scoreRatio, 0);
});

// 多用例 + 多策略：每个 AI 策略在每个样例迷宫上都能返回结果。
for (const strategy of AI_STRATEGIES.map((s) => s.key)) {
  test(`ai strategy ${strategy} simulates without throwing`, () => {
    const result = simulateAi({ ...sample, strategy });
    assert.equal(typeof result.success, 'boolean');
    assert.ok(Array.isArray(result.path));
    assert.equal(result.strategy, strategy);
  });
}

test('cross test builds maze x AI scoring matrix', () => {
  const mazes = [
    { name: 'sample', ...sample },
    { name: 'dfs', ...generateMaze({ size: 15, algorithm: 'dfs', seed: 'ct1' }) },
    { name: 'prim', ...generateMaze({ size: 15, algorithm: 'prim', seed: 'ct2' }) }
  ];
  const result = runCrossTest({ mazes });
  assert.equal(result.mazeCount, 3);
  assert.equal(result.matrix.length, 3);
  assert.equal(result.aiScores.length, AI_STRATEGIES.length);
  assert.equal(result.mazeScores.length, 3);
});
