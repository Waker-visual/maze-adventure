import {
  BOSS,
  COIN,
  COIN_VALUE,
  END,
  START,
  TRAP,
  TRAP_VALUE,
  bfsPath,
  findCells,
  findSingle,
  key,
  normalizeMaze,
  shortestDistances
} from './mazeUtils.js';
import { solveBossGroup } from './bossSolver.js';
import { solveResourcePath } from './resourceDp.js';

// 可选的 AI 玩家策略，用于交叉测试矩阵中作为多个不同的"AI 玩家"。
export const AI_STRATEGIES = [
  { key: 'greedy', name: '贪心拾取', desc: '视野贪心追逐高性价比金币后再奔向终点' },
  { key: 'optimal', name: 'DP 最优', desc: '沿动态规划最优资源路径收集再通关' },
  { key: 'speedrun', name: '竞速直达', desc: '忽略资源，最短路径直奔 BOSS 与终点' }
];

function visibleResources(maze, pos, collected) {
  const result = [];
  for (let r = pos.row - 1; r <= pos.row + 1; r += 1) {
    for (let c = pos.col - 1; c <= pos.col + 1; c += 1) {
      const cell = maze[r]?.[c];
      if ((cell === COIN || cell === TRAP) && !collected.has(key(r, c))) {
        const distance = Math.abs(pos.row - r) + Math.abs(pos.col - c);
        const value = cell === COIN ? COIN_VALUE : TRAP_VALUE;
        result.push({ row: r, col: c, type: cell, value, distance, score: value / (distance + 1) });
      }
    }
  }
  return result.sort((a, b) => b.score - a.score);
}

function nearestTargetPath(maze, start, targets, collected) {
  let best = null;
  for (const target of targets) {
    if (collected.has(key(target.row, target.col))) continue;
    const path = bfsPath(maze, start, target);
    if (!path.length) continue;
    const value = target.type === COIN ? COIN_VALUE : TRAP_VALUE;
    const score = value - (path.length - 1) * 0.4;
    if (!best || score > best.score) best = { target, path, score };
  }
  return best?.score > 20 ? best.path : [];
}

export function simulateAi(input = {}) {
  const maze = normalizeMaze(input.maze);
  const strategy = AI_STRATEGIES.some((s) => s.key === input.strategy) ? input.strategy : 'greedy';
  const start = findSingle(maze, START);
  const end = findSingle(maze, END);
  if (!start || !end) return { success: false, strategy, error: 'maze needs S and E', path: [], events: [] };

  const allCoins = findCells(maze, COIN);
  const bossCells = findCells(maze, BOSS);
  const collected = new Set();
  const path = [{ row: start.row, col: start.col }];
  const events = [];
  let position = { row: start.row, col: start.col };
  let resource = 0;
  let steps = 0;
  let bossSolved = false;

  const appendStep = (next) => {
    if (next.row === position.row && next.col === position.col) return;
    position = { row: next.row, col: next.col };
    path.push(position);
    steps += 1;
    const cell = maze[position.row][position.col];
    const id = key(position.row, position.col);
    const vision = visibleResources(maze, position, collected).slice(0, 4);
    if ((cell === COIN || cell === TRAP) && !collected.has(id)) {
      collected.add(id);
      const delta = cell === COIN ? COIN_VALUE : TRAP_VALUE;
      resource += delta;
      events.push({ step: steps, type: cell === COIN ? 'coin' : 'trap', value: delta, resource, position: [position.row, position.col], vision });
    } else {
      events.push({ step: steps, type: 'move', resource, position: [position.row, position.col], vision });
    }
    if (cell === BOSS && !bossSolved) {
      const boss = solveBossGroup(input);
      if (boss.minTurns > boss.turnLimit) {
        resource -= boss.reviveCost;
      }
      bossSolved = true;
      events.push({
        step: steps,
        type: 'boss',
        result: resource >= 0 ? 'win' : 'win-with-debt',
        minTurns: boss.minTurns,
        turnLimit: boss.turnLimit,
        sequence: boss.bestSequence,
        resource,
        position: [position.row, position.col]
      });
    }
  };

  const follow = (segment) => {
    for (const point of segment.slice(1)) appendStep(point);
  };
  const goTo = (target) => {
    const segment = bfsPath(maze, position, target);
    if (segment.length) follow(segment);
  };

  if (strategy === 'speedrun') {
    for (const target of [...bossCells, end]) goTo(target);
  } else if (strategy === 'optimal') {
    const dp = solveResourcePath(maze);
    for (const cell of (dp.expandedPath ?? []).slice(1)) appendStep(cell);
    for (const target of [...bossCells, end]) goTo(target);
  } else {
    for (let round = 0; round < Math.min(12, allCoins.length); round += 1) {
      const bestCoinPath = nearestTargetPath(maze, position, allCoins, collected);
      if (!bestCoinPath.length) break;
      follow(bestCoinPath);
    }
    for (const target of [...bossCells, end]) goTo(target);
  }

  const reachedEnd = position.row === end.row && position.col === end.col;
  const distFromStart = shortestDistances(maze, start);
  return {
    success: reachedEnd,
    strategy,
    steps,
    remainingResource: resource,
    // 验收指标：到达终点剩余金币数与移动步数的比值；若游戏失败（未到达终点）记为 0。
    scoreRatio: reachedEnd && steps > 0 ? Number((resource / steps).toFixed(3)) : 0,
    coinsCollected: [...collected].filter((id) => {
      const [r, c] = id.split(',').map(Number);
      return maze[r][c] === COIN;
    }).length,
    trapsTriggered: [...collected].filter((id) => {
      const [r, c] = id.split(',').map(Number);
      return maze[r][c] === TRAP;
    }).length,
    reachableCells: distFromStart.size,
    path,
    events
  };
}
