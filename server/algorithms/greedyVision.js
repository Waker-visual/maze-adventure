import {
  COIN,
  TRAP,
  COIN_VALUE,
  TRAP_VALUE,
  DIRS,
  START,
  findSingle,
  inBounds,
  isWalkable,
  key,
  normalizeMaze
} from './mazeUtils.js';

// 扫描以 pos 为中心的 3×3 受限视野，返回视野内尚未拾取的资源，
// 并按"性价比"(单位距离收益) score = value / (距离 + 1) 降序排列。
export function scanVision(maze, pos, collected = new Set()) {
  const result = [];
  for (let r = pos.row - 1; r <= pos.row + 1; r += 1) {
    for (let c = pos.col - 1; c <= pos.col + 1; c += 1) {
      if (r === pos.row && c === pos.col) continue;
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

// 单步贪心决策：在 3×3 视野中挑出性价比最高的正收益资源作为目标，
// 并给出朝它前进、且尽量回避已知陷阱的一步移动。
export function greedyStep(maze, pos, collected = new Set()) {
  const vision = scanVision(maze, pos, collected);
  const target = vision.find((item) => item.score > 0) ?? null;
  const move = target ? stepToward(maze, pos, target, collected) : null;
  return { position: { row: pos.row, col: pos.col }, vision, target, move };
}

function stepToward(maze, pos, target, collected) {
  const curDist = Math.abs(pos.row - target.row) + Math.abs(pos.col - target.col);
  const candidates = [];
  for (const [dr, dc] of DIRS) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (!inBounds(maze, nr, nc) || !isWalkable(maze[nr][nc])) continue;
    const dist = Math.abs(nr - target.row) + Math.abs(nc - target.col);
    const isTrap = maze[nr][nc] === TRAP && !collected.has(key(nr, nc));
    // 不踩陷阱地走向目标；目标本身就是陷阱时则不施加惩罚。
    const trapPenalty = isTrap && !(nr === target.row && nc === target.col) ? 1 : 0;
    candidates.push({ row: nr, col: nc, dist, trapPenalty });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist || a.trapPenalty - b.trapPenalty);
  if (candidates[0].dist >= curDist) return null; // 被墙挡住、无法靠近
  return { row: candidates[0].row, col: candidates[0].col };
}

// 在一个局部迷宫上完整跑一遍贪心拾取，逐步记录可视化轨迹，
// 直到视野内再无正收益资源或步数耗尽。
export function runGreedyCase(rawMaze, startInput, options = {}) {
  const maze = normalizeMaze(rawMaze);
  const rows = maze.length;
  const cols = maze[0]?.length ?? 0;
  const start = startInput ?? findSingle(maze, START) ?? { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
  const maxSteps = Math.max(1, Number(options.maxSteps ?? rows * cols));
  const collected = new Set();
  let pos = { row: start.row, col: start.col };
  let pickedValue = 0;
  let steps = 0;
  const trace = [{ step: 0, row: pos.row, col: pos.col, action: 'start', delta: 0, resource: 0 }];

  // 起点若恰好是资源，先行结算一次。
  const startCell = maze[pos.row]?.[pos.col];
  if (startCell === COIN || startCell === TRAP) {
    collected.add(key(pos.row, pos.col));
    pickedValue += startCell === COIN ? COIN_VALUE : TRAP_VALUE;
  }

  while (steps < maxSteps) {
    const { vision, target, move } = greedyStep(maze, pos, collected);
    if (!target || !move) break;
    pos = { row: move.row, col: move.col };
    steps += 1;
    const id = key(pos.row, pos.col);
    const cell = maze[pos.row][pos.col];
    let delta = 0;
    let action = 'move';
    if ((cell === COIN || cell === TRAP) && !collected.has(id)) {
      collected.add(id);
      delta = cell === COIN ? COIN_VALUE : TRAP_VALUE;
      pickedValue += delta;
      action = cell === COIN ? 'coin' : 'trap';
    }
    trace.push({
      step: steps,
      row: pos.row,
      col: pos.col,
      action,
      delta,
      resource: pickedValue,
      target: { row: target.row, col: target.col, score: Number(target.score.toFixed(2)) },
      visionCount: vision.length
    });
  }

  const ids = [...collected];
  const coinsPicked = ids.filter((id) => {
    const [r, c] = id.split(',').map(Number);
    return maze[r][c] === COIN;
  }).length;
  const trapsHit = ids.filter((id) => {
    const [r, c] = id.split(',').map(Number);
    return maze[r][c] === TRAP;
  }).length;

  return {
    pickedValue,
    steps,
    perStepAverage: steps > 0 ? Number((pickedValue / steps).toFixed(3)) : 0,
    coinsPicked,
    trapsHit,
    start: { row: start.row, col: start.col },
    trace
  };
}

// 批量评测：对多个 3×3 局部测试用例分别跑贪心，给出每用例的拾取价值与
// 每步平均值，并以多用例均值作为贪心策略的整体评价指标。
export function evaluateGreedy(input = {}) {
  const cases = Array.isArray(input.cases) && input.cases.length ? input.cases : defaultGreedyCases();
  const results = cases.map((tc, index) => {
    const maze = tc.maze ?? tc;
    const result = runGreedyCase(maze, tc.start, { maxSteps: tc.maxSteps });
    return { caseIndex: index, name: tc.name ?? `case-${index + 1}`, ...result };
  });
  const n = results.length || 1;
  const sum = (pick) => results.reduce((acc, r) => acc + pick(r), 0);
  return {
    caseCount: results.length,
    meanPickedValue: Number((sum((r) => r.pickedValue) / n).toFixed(3)),
    meanPerStepValue: Number((sum((r) => r.perStepAverage) / n).toFixed(3)),
    totalCoins: sum((r) => r.coinsPicked),
    totalTraps: sum((r) => r.trapsHit),
    results
  };
}

// 几个内置的 3×3 / 局部测试用例，保证前端按钮开箱即用，也作为评测基准。
export function defaultGreedyCases() {
  return [
    {
      name: '双金币优先近距',
      start: { row: 1, col: 1 },
      maze: [
        ['G', ' ', 'G'],
        [' ', ' ', ' '],
        ['T', ' ', 'G']
      ]
    },
    {
      name: '高价值绕开陷阱',
      start: { row: 2, col: 0 },
      maze: [
        ['G', '#', 'G'],
        [' ', 'T', ' '],
        [' ', ' ', 'G']
      ]
    },
    {
      name: '陷阱包围中取币',
      start: { row: 2, col: 2 },
      maze: [
        ['G', 'T', 'G', ' ', 'G'],
        ['T', ' ', ' ', ' ', 'T'],
        [' ', ' ', ' ', ' ', ' '],
        ['G', ' ', 'T', ' ', 'G'],
        [' ', ' ', ' ', ' ', ' ']
      ]
    },
    {
      name: '稀疏金币长路',
      start: { row: 0, col: 0 },
      maze: [
        [' ', ' ', ' ', ' ', 'G'],
        [' ', '#', '#', '#', ' '],
        [' ', ' ', 'G', ' ', ' '],
        ['#', '#', ' ', '#', '#'],
        ['G', ' ', ' ', ' ', 'T']
      ]
    }
  ];
}
