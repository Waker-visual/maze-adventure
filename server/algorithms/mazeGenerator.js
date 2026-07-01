import {
  WALL,
  ROAD,
  START,
  END,
  COIN,
  TRAP,
  BOSS,
  buildMazePayload,
  bfsPath,
  cloneMaze,
  findSingle,
  getWalkableCells,
  key,
  makeRng,
  normalizeMaze,
  walkableNeighbors
} from './mazeUtils.js';
import { ALGORITHM_INFO } from './algorithmInfo.js';

// 模块级可替换随机源：generateMaze / compareGenerators 在入口处用 setRng(seed)
// 切换为可复现序列，所有生成器内部统一通过 rand() 取随机数。
let rand = Math.random;
function setRng(seed) {
  rand = makeRng(seed);
}

function oddSize(size) {
  const n = Math.max(9, Number(size) || 15);
  return n % 2 === 1 ? n : n + 1;
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function filled(size, value = WALL) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

function cellDirs() {
  return [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2]
  ];
}

function insideInterior(size, row, col) {
  return row > 0 && row < size - 1 && col > 0 && col < size - 1;
}

function carve(maze, a, b) {
  maze[a.row][a.col] = ROAD;
  maze[(a.row + b.row) / 2][(a.col + b.col) / 2] = ROAD;
  maze[b.row][b.col] = ROAD;
}

function generateDfs(size) {
  const maze = filled(size);
  const stack = [{ row: 1, col: 1 }];
  maze[1][1] = ROAD;
  const snapshots = [];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = shuffle(cellDirs())
      .map(([dr, dc]) => ({ row: cur.row + dr, col: cur.col + dc, wall: { row: cur.row + dr / 2, col: cur.col + dc / 2 } }))
      .filter((next) => insideInterior(size, next.row, next.col) && maze[next.row][next.col] === WALL);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const next = options[0];
    maze[next.wall.row][next.wall.col] = ROAD;
    maze[next.row][next.col] = ROAD;
    stack.push({ row: next.row, col: next.col });
    if (snapshots.length < 180) snapshots.push(cloneMaze(maze));
  }
  return { maze, snapshots };
}

function generatePrim(size) {
  const maze = filled(size);
  const frontier = [];
  const addFrontier = (cell) => {
    for (const [dr, dc] of cellDirs()) {
      const nr = cell.row + dr;
      const nc = cell.col + dc;
      if (insideInterior(size, nr, nc) && maze[nr][nc] === WALL) {
        frontier.push({ row: nr, col: nc, from: cell });
      }
    }
  };
  const start = { row: 1, col: 1 };
  maze[start.row][start.col] = ROAD;
  addFrontier(start);
  const snapshots = [];
  while (frontier.length) {
    const idx = Math.floor(rand() * frontier.length);
    const next = frontier.splice(idx, 1)[0];
    if (maze[next.row][next.col] !== WALL) continue;
    const neighbors = cellDirs()
      .map(([dr, dc]) => ({ row: next.row + dr, col: next.col + dc }))
      .filter((cell) => insideInterior(size, cell.row, cell.col) && maze[cell.row][cell.col] === ROAD);
    const from = neighbors[Math.floor(rand() * neighbors.length)] ?? next.from;
    carve(maze, from, next);
    addFrontier({ row: next.row, col: next.col });
    if (snapshots.length < 180) snapshots.push(cloneMaze(maze));
  }
  return { maze, snapshots };
}

function generateDivide(size) {
  const maze = filled(size, ROAD);
  for (let i = 0; i < size; i += 1) {
    maze[0][i] = WALL;
    maze[size - 1][i] = WALL;
    maze[i][0] = WALL;
    maze[i][size - 1] = WALL;
  }
  const snapshots = [];
  const divide = (top, left, bottom, right) => {
    const height = bottom - top + 1;
    const width = right - left + 1;
    if (height < 3 || width < 3) return;
    const horizontal = height > width ? true : width > height ? false : rand() < 0.5;
    if (horizontal) {
      const candidates = [];
      for (let r = top + 1; r <= bottom - 1; r += 2) candidates.push(r);
      const wallRow = candidates[Math.floor(rand() * candidates.length)];
      const doors = [];
      for (let c = left; c <= right; c += 2) doors.push(c);
      const doorCol = doors[Math.floor(rand() * doors.length)];
      for (let c = left; c <= right; c += 1) maze[wallRow][c] = WALL;
      maze[wallRow][doorCol] = ROAD;
      if (snapshots.length < 180) snapshots.push(cloneMaze(maze));
      divide(top, left, wallRow - 1, right);
      divide(wallRow + 1, left, bottom, right);
    } else {
      const candidates = [];
      for (let c = left + 1; c <= right - 1; c += 2) candidates.push(c);
      const wallCol = candidates[Math.floor(rand() * candidates.length)];
      const doors = [];
      for (let r = top; r <= bottom; r += 2) doors.push(r);
      const doorRow = doors[Math.floor(rand() * doors.length)];
      for (let r = top; r <= bottom; r += 1) maze[r][wallCol] = WALL;
      maze[doorRow][wallCol] = ROAD;
      if (snapshots.length < 180) snapshots.push(cloneMaze(maze));
      divide(top, left, bottom, wallCol - 1);
      divide(top, wallCol + 1, bottom, right);
    }
  };
  divide(1, 1, size - 2, size - 2);
  return { maze, snapshots };
}

function generateBranchBfs(size) {
  const maze = filled(size);
  const start = { row: 1, col: 1, score: 0 };
  const frontier = [start];
  maze[1][1] = ROAD;
  const snapshots = [];
  while (frontier.length) {
    frontier.sort((a, b) => b.score - a.score);
    const cur = frontier.shift();
    const nextCells = shuffle(cellDirs())
      .map(([dr, dc]) => ({ row: cur.row + dr, col: cur.col + dc, wall: { row: cur.row + dr / 2, col: cur.col + dc / 2 } }))
      .filter((next) => insideInterior(size, next.row, next.col) && maze[next.row][next.col] === WALL);
    for (const next of nextCells) {
      const distanceBias = next.row + next.col;
      const branchBias = rand() * size;
      next.score = distanceBias * 0.65 + branchBias * 0.35;
      maze[next.wall.row][next.wall.col] = ROAD;
      maze[next.row][next.col] = ROAD;
      frontier.push(next);
      if (frontier.length > size * 3) frontier.splice(Math.floor(frontier.length * 0.75));
      if (snapshots.length < 180) snapshots.push(cloneMaze(maze));
    }
  }
  return { maze, snapshots };
}

function chooseFarthestEnd(maze, start) {
  const q = [{ ...start, dist: 0 }];
  const seen = new Set([key(start.row, start.col)]);
  let best = start;
  while (q.length) {
    const cur = q.shift();
    if (cur.dist > (best.dist ?? -1)) best = cur;
    for (const next of walkableNeighbors(maze, cur.row, cur.col)) {
      const nk = key(next.row, next.col);
      if (!seen.has(nk)) {
        seen.add(nk);
        q.push({ ...next, dist: cur.dist + 1 });
      }
    }
  }
  return { row: best.row, col: best.col };
}

function emptyRoadCells(maze) {
  return getWalkableCells(maze).filter((cell) => maze[cell.row][cell.col] === ROAD);
}

function placeResources(maze, options = {}) {
  const coinCount = Math.max(0, Number(options.coinCount ?? 8));
  const trapCount = Math.max(0, Number(options.trapCount ?? 5));
  const start = findSingle(maze, START);
  const end = findSingle(maze, END);
  const mainPath = bfsPath(maze, start, end);
  const pathKeys = new Set(mainPath.map((p) => key(p.row, p.col)));
  const bossIndex = Math.max(1, mainPath.length - 3);
  const bossCell = mainPath[bossIndex];
  if (bossCell && maze[bossCell.row][bossCell.col] === ROAD) maze[bossCell.row][bossCell.col] = BOSS;

  const candidates = shuffle(emptyRoadCells(maze));
  const scoreCell = (cell, preferBranch) => {
    const onPath = pathKeys.has(key(cell.row, cell.col));
    const nearEnd = Math.abs(cell.row - end.row) + Math.abs(cell.col - end.col);
    return (preferBranch && !onPath ? 20 : 0) + nearEnd * 0.2 + rand() * 10;
  };
  const coins = [...candidates].sort((a, b) => scoreCell(b, true) - scoreCell(a, true)).slice(0, coinCount);
  for (const cell of coins) maze[cell.row][cell.col] = COIN;

  const used = new Set(coins.map((cell) => key(cell.row, cell.col)));
  const traps = shuffle(emptyRoadCells(maze).filter((cell) => !used.has(key(cell.row, cell.col))))
    .sort((a, b) => scoreCell(b, false) - scoreCell(a, false))
    .slice(0, trapCount);
  for (const cell of traps) maze[cell.row][cell.col] = TRAP;
}

const GENERATORS = {
  dfs: generateDfs,
  prim: generatePrim,
  divide: generateDivide,
  branch: generateBranchBfs
};

// 在已确定随机源的前提下，按指定算法雕刻迷宫并完成起终点选取、资源布置与校验。
function buildMaze(algorithm, size, options) {
  const selected = GENERATORS[algorithm] ?? generateDfs;
  const { maze, snapshots } = selected(size);
  const start = { row: 1, col: 1 };
  const end = chooseFarthestEnd(maze, start);
  maze[start.row][start.col] = START;
  maze[end.row][end.col] = END;
  placeResources(maze, options);
  const validation = validateMaze(maze);
  const path = bfsPath(maze, findSingle(maze, START), findSingle(maze, END));
  const metrics = analyzeMaze(maze, path);
  return { maze, snapshots, validation, metrics, path };
}

export function generateMaze(options = {}) {
  const size = oddSize(options.size);
  const algorithm = options.algorithm ?? 'dfs';
  setRng(options.seed);
  const { maze, snapshots, validation, metrics } = buildMaze(algorithm, size, options);
  return {
    ...buildMazePayload(maze, {
      B: options.B,
      PlayerSkills: options.PlayerSkills,
      minRouds: options.minRouds,
      CoinConsumption: options.CoinConsumption
    }),
    algorithm,
    seed: options.seed ?? null,
    validation,
    metrics,
    snapshots
  };
}

// 在同一尺寸与种子下并行对比四种生成范式，输出可量化指标 + 复杂度元数据，
// 直接服务于"从时间/空间复杂度、挑战性等角度对比分析"的需求。
export function compareGenerators(options = {}) {
  const size = oddSize(options.size);
  const algorithms = options.algorithms ?? Object.keys(GENERATORS);
  const rounds = Math.max(1, Math.min(20, Number(options.rounds ?? 3)));
  const results = algorithms.map((algorithm) => {
    let totalMs = 0;
    let sample = null;
    const challengeScores = [];
    let connectedCount = 0;
    let uniqueCount = 0;
    for (let i = 0; i < rounds; i += 1) {
      const seed = options.seed !== undefined && options.seed !== null && options.seed !== ''
        ? `${options.seed}-${algorithm}-${i}`
        : undefined;
      setRng(seed);
      const startedAt = performance.now();
      const built = buildMaze(algorithm, size, options);
      totalMs += performance.now() - startedAt;
      challengeScores.push(built.metrics.challengeScore);
      if (built.validation.connected) connectedCount += 1;
      if (built.validation.uniquePath) uniqueCount += 1;
      if (i === 0) sample = built;
    }
    const avgChallenge = challengeScores.reduce((s, v) => s + v, 0) / rounds;
    return {
      algorithm,
      info: ALGORITHM_INFO[algorithm] ?? null,
      rounds,
      avgTimeMs: Number((totalMs / rounds).toFixed(3)),
      avgChallengeScore: Number(avgChallenge.toFixed(1)),
      connectedRate: Number((connectedCount / rounds).toFixed(2)),
      uniquePathRate: Number((uniqueCount / rounds).toFixed(2)),
      sampleMetrics: sample?.metrics ?? null,
      sampleMaze: sample?.maze ?? null
    };
  });
  return { size, rounds, seed: options.seed ?? null, results };
}

export function validateMaze(inputMaze) {
  const maze = normalizeMaze(inputMaze);
  const errors = [];
  const rows = maze.length;
  const cols = maze[0]?.length ?? 0;
  const rectangular = rows > 0 && maze.every((row) => row.length === cols);
  const starts = findCellsSafe(maze, START);
  const ends = findCellsSafe(maze, END);
  if (!rectangular) errors.push('maze must be rectangular');
  if (starts.length !== 1) errors.push('maze must contain exactly one S');
  if (ends.length !== 1) errors.push('maze must contain exactly one E');

  const walkables = rectangular ? getWalkableCells(maze) : [];
  let connected = false;
  let uniquePath = false;
  let edgeCount = 0;
  if (walkables.length && starts.length === 1) {
    const q = [starts[0]];
    const seen = new Set([key(starts[0].row, starts[0].col)]);
    while (q.length) {
      const cur = q.shift();
      for (const next of walkableNeighbors(maze, cur.row, cur.col)) {
        if (key(cur.row, cur.col) < key(next.row, next.col)) edgeCount += 1;
        const nk = key(next.row, next.col);
        if (!seen.has(nk)) {
          seen.add(nk);
          q.push(next);
        }
      }
    }
    connected = seen.size === walkables.length;
    uniquePath = connected && edgeCount === walkables.length - 1;
  }
  if (!connected) errors.push('walkable cells are not fully connected');
  return {
    valid: errors.length === 0,
    rectangular,
    size: { rows, cols },
    startCount: starts.length,
    endCount: ends.length,
    connected,
    uniquePath,
    walkableCount: walkables.length,
    edgeCount,
    errors
  };
}

function findCellsSafe(maze, target) {
  const result = [];
  for (let r = 0; r < maze.length; r += 1) {
    for (let c = 0; c < (maze[r]?.length ?? 0); c += 1) {
      if (maze[r][c] === target) result.push({ row: r, col: c });
    }
  }
  return result;
}

export function analyzeMaze(maze, mainPath = []) {
  const walkables = getWalkableCells(maze);
  const deadEnds = walkables.filter((cell) => walkableNeighbors(maze, cell.row, cell.col).length === 1).length;
  const coins = walkables.filter((cell) => cell.type === COIN).length;
  const traps = walkables.filter((cell) => cell.type === TRAP).length;
  const bosses = walkables.filter((cell) => cell.type === BOSS).length;
  const challengeScore = Math.round(
    Math.min(100, mainPath.length * 1.4 + deadEnds * 2 + coins * 2 + traps * 1.5 + bosses * 8)
  );
  return {
    pathCells: walkables.length,
    deadEnds,
    mainPathLength: mainPath.length,
    coins,
    traps,
    bosses,
    challengeScore
  };
}
