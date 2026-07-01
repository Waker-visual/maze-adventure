export const WALL = '#';
export const ROAD = ' ';
export const START = 'S';
export const END = 'E';
export const COIN = 'G';
export const TRAP = 'T';
export const BOSS = 'B';

export const COIN_VALUE = 50;
export const TRAP_VALUE = -30;

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

export function cloneMaze(maze) {
  return maze.map((row) => [...row]);
}

export function normalizeMaze(maze) {
  if (!Array.isArray(maze)) throw new Error('maze must be a two-dimensional array');
  return maze.map((row) => {
    if (Array.isArray(row)) return row.map((cell) => String(cell));
    if (typeof row === 'string') return [...row];
    throw new Error('each maze row must be an array or string');
  });
}

export function inBounds(maze, row, col) {
  return row >= 0 && row < maze.length && col >= 0 && col < maze[0].length;
}

export function isWalkable(cell) {
  return cell !== WALL;
}

export function key(row, col) {
  return `${row},${col}`;
}

export function fromKey(value) {
  return value.split(',').map(Number);
}

export function findCells(maze, targets) {
  const set = new Set(Array.isArray(targets) ? targets : [targets]);
  const cells = [];
  for (let r = 0; r < maze.length; r += 1) {
    for (let c = 0; c < maze[r].length; c += 1) {
      if (set.has(maze[r][c])) cells.push({ row: r, col: c, type: maze[r][c] });
    }
  }
  return cells;
}

export function findSingle(maze, target) {
  const cells = findCells(maze, target);
  return cells.length ? cells[0] : null;
}

export function walkableNeighbors(maze, row, col) {
  const result = [];
  for (const [dr, dc] of DIRS) {
    const nr = row + dr;
    const nc = col + dc;
    if (inBounds(maze, nr, nc) && isWalkable(maze[nr][nc])) result.push({ row: nr, col: nc });
  }
  return result;
}

export function bfsPath(maze, start, end, blocked = new Set()) {
  if (!start || !end) return [];
  const q = [start];
  const seen = new Set([key(start.row, start.col)]);
  const prev = new Map();
  while (q.length) {
    const cur = q.shift();
    if (cur.row === end.row && cur.col === end.col) {
      const path = [];
      let k = key(cur.row, cur.col);
      while (k) {
        const [r, c] = fromKey(k);
        path.push({ row: r, col: c });
        k = prev.get(k);
      }
      return path.reverse();
    }
    for (const next of walkableNeighbors(maze, cur.row, cur.col)) {
      const nk = key(next.row, next.col);
      if (!seen.has(nk) && !blocked.has(nk)) {
        seen.add(nk);
        prev.set(nk, key(cur.row, cur.col));
        q.push(next);
      }
    }
  }
  return [];
}

export function shortestDistances(maze, start) {
  const q = [{ ...start, dist: 0 }];
  const dist = new Map([[key(start.row, start.col), 0]]);
  while (q.length) {
    const cur = q.shift();
    for (const next of walkableNeighbors(maze, cur.row, cur.col)) {
      const nk = key(next.row, next.col);
      if (!dist.has(nk)) {
        dist.set(nk, cur.dist + 1);
        q.push({ ...next, dist: cur.dist + 1 });
      }
    }
  }
  return dist;
}

export function getWalkableCells(maze) {
  const cells = [];
  for (let r = 0; r < maze.length; r += 1) {
    for (let c = 0; c < maze[r].length; c += 1) {
      if (isWalkable(maze[r][c])) cells.push({ row: r, col: c, type: maze[r][c] });
    }
  }
  return cells;
}

export function resourceValue(cell) {
  if (cell === COIN) return COIN_VALUE;
  if (cell === TRAP) return TRAP_VALUE;
  return 0;
}

export function matrixToText(maze) {
  return maze.map((row) => row.join('')).join('\n');
}

export function makeDefaultSkills() {
  return [[8, 4], [2, 0], [4, 2], [6, 3]];
}

export function buildMazePayload(maze, options = {}) {
  return {
    maze,
    B: options.B ?? [11, 13, 9, 15],
    PlayerSkills: options.PlayerSkills ?? makeDefaultSkills(),
    minRouds: options.minRouds ?? 20,
    CoinConsumption: options.CoinConsumption ?? 5
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 可复现伪随机数发生器（mulberry32）。给定相同 seed 可重复生成同一迷宫，
// 便于阶段测试、交叉测试的复现与对照；未传 seed 时回退到 Math.random。
export function makeRng(seed) {
  if (seed === undefined || seed === null || seed === '') return Math.random;
  let s = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashString(String(seed));
  if (s === 0) s = 0x9e3779b9;
  return function mulberry32() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
