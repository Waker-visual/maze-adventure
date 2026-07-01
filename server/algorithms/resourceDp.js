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
  resourceValue
} from './mazeUtils.js';

function pathBetween(maze, a, b) {
  return bfsPath(maze, a, b);
}

export function solveResourcePath(inputMaze, limit = 16) {
  const maze = normalizeMaze(inputMaze);
  const start = findSingle(maze, START);
  const end = findSingle(maze, END);
  const resources = findCells(maze, [COIN, TRAP]).slice(0, limit).map((cell, index) => ({
    ...cell,
    id: index,
    value: resourceValue(cell.type)
  }));

  if (!start || !end) {
    return { maxResource: 0, resourcePath: [], expandedPath: [], dpStates: [], error: 'maze needs S and E' };
  }

  const points = [start, ...resources, end];
  const dist = Array.from({ length: points.length }, () => Array(points.length).fill(Infinity));
  const paths = new Map();
  for (let i = 0; i < points.length; i += 1) {
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) {
        dist[i][j] = 0;
        continue;
      }
      const path = pathBetween(maze, points[i], points[j]);
      if (path.length) {
        dist[i][j] = path.length - 1;
        paths.set(`${i}-${j}`, path);
      }
    }
  }

  const r = resources.length;
  const totalMasks = 1 << r;
  const dp = Array.from({ length: totalMasks }, () => Array(r).fill(-Infinity));
  const prev = new Map();
  const states = [];

  for (let i = 0; i < r; i += 1) {
    if (Number.isFinite(dist[0][i + 1])) {
      const mask = 1 << i;
      dp[mask][i] = resources[i].value;
      prev.set(`${mask}-${i}`, null);
      states.push({ mask, at: i, value: dp[mask][i] });
    }
  }

  for (let mask = 0; mask < totalMasks; mask += 1) {
    for (let i = 0; i < r; i += 1) {
      if (!Number.isFinite(dp[mask][i])) continue;
      for (let j = 0; j < r; j += 1) {
        if (mask & (1 << j)) continue;
        if (!Number.isFinite(dist[i + 1][j + 1])) continue;
        const nextMask = mask | (1 << j);
        const nextValue = dp[mask][i] + resources[j].value;
        if (nextValue > dp[nextMask][j]) {
          dp[nextMask][j] = nextValue;
          prev.set(`${nextMask}-${j}`, { mask, at: i });
          if (states.length < 300) states.push({ mask: nextMask, at: j, value: nextValue });
        }
      }
    }
  }

  let best = { value: 0, mask: 0, at: -1 };
  for (let mask = 0; mask < totalMasks; mask += 1) {
    for (let i = 0; i < r; i += 1) {
      if (!Number.isFinite(dp[mask][i])) continue;
      const canReachEnd = Number.isFinite(dist[i + 1][points.length - 1]);
      if (canReachEnd && dp[mask][i] > best.value) best = { value: dp[mask][i], mask, at: i };
    }
  }

  const chosen = [];
  if (best.at !== -1) {
    let state = { mask: best.mask, at: best.at };
    while (state) {
      chosen.push(state.at);
      state = prev.get(`${state.mask}-${state.at}`);
    }
    chosen.reverse();
  }

  const pointIndexes = [0, ...chosen.map((i) => i + 1), points.length - 1];
  const expandedPath = [];
  for (let i = 0; i < pointIndexes.length - 1; i += 1) {
    const segment = paths.get(`${pointIndexes[i]}-${pointIndexes[i + 1]}`) ?? [];
    expandedPath.push(...(i === 0 ? segment : segment.slice(1)));
  }

  return {
    maxResource: best.value,
    resourcePath: chosen.map((i) => ({ row: resources[i].row, col: resources[i].col, type: resources[i].type, value: resources[i].value })),
    expandedPath,
    dpStates: states,
    consideredResources: resources.length,
    note: resources.length >= limit ? `only first ${limit} resources are used to avoid state explosion` : ''
  };
}

export function scorePathResources(maze, path) {
  const collected = new Set();
  let value = 0;
  const events = [];
  for (const pos of path) {
    const cell = maze[pos.row]?.[pos.col];
    const id = key(pos.row, pos.col);
    if (!collected.has(id) && (cell === COIN || cell === TRAP)) {
      collected.add(id);
      value += cell === COIN ? COIN_VALUE : TRAP_VALUE;
      events.push({ position: [pos.row, pos.col], type: cell, value: cell === COIN ? COIN_VALUE : TRAP_VALUE });
    }
    if (cell === BOSS) events.push({ position: [pos.row, pos.col], type: BOSS, value: 0 });
  }
  return { value, events };
}
