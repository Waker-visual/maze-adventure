import {
  BOSS,
  COIN,
  COIN_VALUE,
  START,
  TRAP,
  TRAP_VALUE,
  bfsPath,
  findCells,
  findSingle,
  getWalkableCells,
  key,
  normalizeMaze,
  resourceValue,
  walkableNeighbors
} from './mazeUtils.js';

function pathBetween(maze, a, b) {
  return bfsPath(maze, a, b);
}

// 迷宫是"完美迷宫"（起终点间唯一通路，即一棵生成树），所以从 S 出发做 BFS
// 得到的父子关系就是这棵树本身，不存在环路捷径。基于这棵树做资源收集 DP，
// 复杂度是 O(格子数)，不随金币/陷阱数量指数增长，不需要像子集背包 DP 那样设资源数上限。
function buildResourceTree(maze, start) {
  const startKey = key(start.row, start.col);
  const parent = new Map([[startKey, null]]);
  const children = new Map([[startKey, []]]);
  const posOf = new Map([[startKey, start]]);
  const order = [startKey];
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const curKey = key(cur.row, cur.col);
    for (const next of walkableNeighbors(maze, cur.row, cur.col)) {
      const nextKey = key(next.row, next.col);
      if (parent.has(nextKey)) continue;
      parent.set(nextKey, curKey);
      children.set(nextKey, []);
      children.get(curKey).push(nextKey);
      posOf.set(nextKey, next);
      order.push(nextKey);
      queue.push(next);
    }
  }
  return { order, parent, children, posOf };
}

// 树形 DP：net(节点) = 该格资源值 + 所有"值得进入"（net>0）子树的 net 之和。
// 因为在树上往返子树不会重复计分（同一格只算一次收益/损失），所以是否走回来
// 只影响步数，不影响能收集到的最大资源值——这正好对应"收集完最优资源即可停止，
// 不需要走到终点"的要求。net(起点) 就是全图可达的最大资源值。
function solveResourceTreeDP(inputMaze) {
  const maze = normalizeMaze(inputMaze);
  const start = findSingle(maze, START);
  if (!start) {
    return { maxResource: 0, resourcePath: [], expandedPath: [], pathLength: 0, dpStates: [], consideredResources: 0, error: 'maze needs S' };
  }

  const tree = buildResourceTree(maze, start);
  const net = new Map();
  for (let i = tree.order.length - 1; i >= 0; i -= 1) {
    const nodeKey = tree.order[i];
    const pos = tree.posOf.get(nodeKey);
    let total = resourceValue(maze[pos.row][pos.col]);
    for (const childKey of tree.children.get(nodeKey)) {
      const childNet = net.get(childKey);
      if (childNet > 0) total += childNet;
    }
    net.set(nodeKey, total);
  }

  const startKey = key(start.row, start.col);

  // reach(节点) = 从该节点到"最远的一个值得进入的资源后代"的边数（在只保留净收益为正的
  // 子树上度量的深度）。用它决定每个岔路口最后走哪条分支：最后走的分支不用原路退回，
  // 所以把 reach 最大的分支留到最后，就能省下最长的一段回程，使总步数最少
  // （等价于在需要访问的最小子树上，总步数 = 2*边数 - 最长的一条根到叶路径）。
  const reach = new Map();
  for (let i = tree.order.length - 1; i >= 0; i -= 1) {
    const nodeKey = tree.order[i];
    let far = 0;
    for (const childKey of tree.children.get(nodeKey)) {
      if (net.get(childKey) > 0) far = Math.max(far, 1 + reach.get(childKey));
    }
    reach.set(nodeKey, far);
  }

  // 沿途实际拼出一条路径：每层只有"最后处理"的那个值得进入的子分支不用走回来，
  // 其余分支进去拿完资源后要原路退回，才能继续进别的分支。
  //
  // 注意：子分支自己走完之后停在哪个格子（endKey）不一定是它的直接子节点——
  // 子分支内部也可能有多个岔路，真正停下的格子可能在好几层之下。退回时必须沿着
  // 树上的父指针从 endKey 一步步走回 nodeKey，不能简单地把子分支整段路径反过来走，
  // 否则子分支内部已经"进去再退回"过的岔路会被当成退回路线重新走一遍，
  // 导致其中的资源格被多算一次步数（表现出来就是同一个金币/陷阱被反复经过）。
  function buildPath(nodeKey) {
    const nodePos = tree.posOf.get(nodeKey);
    const path = [nodePos];
    let endKey = nodeKey;
    const kids = tree.children.get(nodeKey).filter((childKey) => net.get(childKey) > 0);
    // reach 小的先走（要退回），reach 最大的留到最后（不退回），从而省下最长的一段回程。
    kids.sort((a, b) => reach.get(a) - reach.get(b));
    for (let i = 0; i < kids.length; i += 1) {
      const { path: sub, endKey: subEnd } = buildPath(kids[i]);
      path.push(...sub);
      if (i < kids.length - 1) {
        let cur = subEnd;
        while (cur !== nodeKey) {
          cur = tree.parent.get(cur);
          path.push(tree.posOf.get(cur));
        }
        endKey = nodeKey;
      } else {
        endKey = subEnd;
      }
    }
    return { path, endKey };
  }

  const expandedPath = buildPath(startKey).path;

  const resourcePath = [];
  const seen = new Set();
  for (const pos of expandedPath) {
    const cell = maze[pos.row][pos.col];
    const cellKey = key(pos.row, pos.col);
    if ((cell === COIN || cell === TRAP) && !seen.has(cellKey)) {
      seen.add(cellKey);
      resourcePath.push({ row: pos.row, col: pos.col, type: cell, value: resourceValue(cell) });
    }
  }

  return {
    maxResource: net.get(startKey),
    resourcePath,
    expandedPath,
    pathLength: expandedPath.length - 1,
    dpStates: [],
    consideredResources: findCells(maze, [COIN, TRAP]).length,
    note: ''
  };
}

// 官方 API `/api/resource/optimal-path`：资源收集 DP。
// 不强制走回终点——是否回到 E 由调用方（比如 AI 玩家）自行决定要不要再单独寻路过去。
export function solveResourcePath(inputMaze) {
  return solveResourceTreeDP(inputMaze);
}

// 资源收集路径测试（自由起点版）：出发点可自行选择迷宫内任意可通行格子，不必从迷宫起点 S 出发，
// 目标是收集到的资源总价值最大；收集完即可停止，不必走到终点。
//
// 起点 S 不设奖励（价值 0），且【最优采集路径不经过起点 S】：把 S 当作不可踏入的格子，
// 从采集图里整体排除。若 S 是叶子（真实测试迷宫都是），排除它不影响任何金币的采集；
// 若 S 恰是关键岔口（度≥2），排除它会把迷宫切成几块，此时在各连通块中取最优的一块采集。
//
// 完美迷宫是一棵树，"从某个起点出发能收集到的资源"= 一棵包含该起点的连通子树里所有格子的资源值之和
// （子树里的每个格子都会被踩到，金币 +、陷阱 -）。要在"自由起点"下取最大，等价于求（排除 S 后）
// 【最大权连通子树】——与从哪个固定点出发无关。做法：对排除 S 后的生成森林算 down[v]（v 及其正收益
// 子树之和），每个连通子树都有唯一"最高点"，其最优取值就是 down[最高点]，故全局最大 = max_v down[v]。
// 取到该最大值的子树 T 即最优采集区域，T 内任意格子都是等价的"最优起点"（采到的价值相同）。
// 为了让展示的路径尽量短，起点选 T 的直径一端、终点落在另一端，步数最少。
export function solveResourceCollectOnly(inputMaze) {
  const maze = normalizeMaze(inputMaze);
  const totalResources = findCells(maze, [COIN, TRAP]).length;

  // 起点 S 从采集图中整体排除：路径不会踏入 S，S 也不作为可选起点。
  const startCell = findSingle(maze, START);
  const blocked = new Set();
  if (startCell) blocked.add(key(startCell.row, startCell.col));

  const posOfKey = (k) => { const [r, c] = k.split(',').map(Number); return { row: r, col: c }; };
  const neighbors = (k) => {
    const { row, col } = posOfKey(k);
    return walkableNeighbors(maze, row, col).map((n) => key(n.row, n.col)).filter((nk) => !blocked.has(nk));
  };

  const walkable = getWalkableCells(maze).filter((c) => !blocked.has(key(c.row, c.col)));
  if (!walkable.length) {
    return { maxResource: 0, resourcePath: [], expandedPath: [], pathLength: 0, start: null, dpStates: [], consideredResources: totalResources, note: '排除起点后没有可通行格' };
  }

  // 对"排除 S 后"的可通行格建生成森林（S 若是岔口会切成多块），各块共用一套 parent/children。
  const parentAll = new Map();
  const childrenAll = new Map();
  const order = [];
  for (const cell of walkable) {
    const rootKey = key(cell.row, cell.col);
    if (parentAll.has(rootKey)) continue;
    parentAll.set(rootKey, null);
    childrenAll.set(rootKey, []);
    order.push(rootKey);
    const queue = [rootKey];
    while (queue.length) {
      const cur = queue.shift();
      for (const nk of neighbors(cur)) {
        if (parentAll.has(nk)) continue;
        parentAll.set(nk, cur);
        childrenAll.set(nk, []);
        childrenAll.get(cur).push(nk);
        order.push(nk);
        queue.push(nk);
      }
    }
  }

  // 自底向上算 down[v]（各连通块独立，因为 children 只在块内）。
  const down = new Map();
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const nodeKey = order[i];
    const pos = posOfKey(nodeKey);
    let value = resourceValue(maze[pos.row][pos.col]);
    for (const childKey of childrenAll.get(nodeKey)) {
      if (down.get(childKey) > 0) value += down.get(childKey);
    }
    down.set(nodeKey, value);
  }

  // 最大权连通子树的最大价值 = 全森林中最大的 down。
  let maxDown = down.get(order[0]);
  for (const nodeKey of order) if (down.get(nodeKey) > maxDown) maxDown = down.get(nodeKey);
  const maxResource = Math.max(0, maxDown);

  // apex 取"达到最大 down 且没有任何子节点也等于最大 down"的节点，即这一段并列 down 里最深的那个。
  // 否则会把 apex 定在最高的祖先上，把它上方一串价值为 0 的死胡同走廊（例如通往终点 E 的支路）
  // 也算进采集子树——这些走廊不通向任何金币，收集价值为 0，只会让路径白白变长。取最深节点即可剔除。
  let apexKey = null;
  for (const nodeKey of order) {
    if (down.get(nodeKey) !== maxResource) continue;
    const hasChildAtMax = childrenAll.get(nodeKey).some((childKey) => down.get(childKey) === maxResource);
    if (!hasChildAtMax) { apexKey = nodeKey; break; }
  }

  // 没有任何正收益子树（全是陷阱或没有金币）：最优就是不采集。
  if (maxResource <= 0) {
    return {
      maxResource: 0,
      resourcePath: [],
      expandedPath: [],
      pathLength: 0,
      start: null,
      dpStates: [],
      consideredResources: totalResources,
      note: '没有净收益为正的采集区域，最优策略是不采集任何资源'
    };
  }

  // 提取最优采集子树 T：apex 及其所有正收益后代。
  const inT = new Set();
  (function mark(nodeKey) {
    inT.add(nodeKey);
    for (const childKey of childrenAll.get(nodeKey)) {
      if (down.get(childKey) > 0) mark(childKey);
    }
  })(apexKey);

  const neighborsInT = (k) => neighbors(k).filter((nk) => inT.has(nk));

  // 在 T 内做两次 BFS 求直径：起点取直径一端，路径终点落在另一端 → 步数最少。
  const bfsFarthest = (startKey) => {
    const dist = new Map([[startKey, 0]]);
    const queue = [startKey];
    let farthest = startKey;
    while (queue.length) {
      const cur = queue.shift();
      for (const nk of neighborsInT(cur)) {
        if (dist.has(nk)) continue;
        dist.set(nk, dist.get(cur) + 1);
        if (dist.get(nk) > dist.get(farthest)) farthest = nk;
        queue.push(nk);
      }
    }
    return farthest;
  };
  const startKey = bfsFarthest(bfsFarthest(apexKey));

  // 以直径起点为根重建 T，遍历时"最深的子分支留到最后走"（不必回头），使总步数最少。
  const tParent = new Map([[startKey, null]]);
  const tChildren = new Map([[startKey, []]]);
  const tOrder = [startKey];
  const bq = [startKey];
  while (bq.length) {
    const cur = bq.shift();
    for (const nk of neighborsInT(cur)) {
      if (tParent.has(nk)) continue;
      tParent.set(nk, cur);
      tChildren.set(nk, []);
      tChildren.get(cur).push(nk);
      tOrder.push(nk);
      bq.push(nk);
    }
  }
  const reach = new Map();
  for (let i = tOrder.length - 1; i >= 0; i -= 1) {
    const nodeKey = tOrder[i];
    let far = 0;
    for (const childKey of tChildren.get(nodeKey)) far = Math.max(far, 1 + reach.get(childKey));
    reach.set(nodeKey, far);
  }
  function buildPath(nodeKey) {
    const path = [posOfKey(nodeKey)];
    let endKey = nodeKey;
    const kids = [...tChildren.get(nodeKey)].sort((a, b) => reach.get(a) - reach.get(b));
    for (let i = 0; i < kids.length; i += 1) {
      const { path: sub, endKey: subEnd } = buildPath(kids[i]);
      path.push(...sub);
      if (i < kids.length - 1) {
        let cur = subEnd;
        while (cur !== nodeKey) {
          cur = tParent.get(cur);
          path.push(posOfKey(cur));
        }
        endKey = nodeKey;
      } else {
        endKey = subEnd;
      }
    }
    return { path, endKey };
  }
  const expandedPath = buildPath(startKey).path;

  const resourcePath = [];
  const seen = new Set();
  for (const pos of expandedPath) {
    const cell = maze[pos.row][pos.col];
    const cellKey = key(pos.row, pos.col);
    if ((cell === COIN || cell === TRAP) && !seen.has(cellKey)) {
      seen.add(cellKey);
      resourcePath.push({ row: pos.row, col: pos.col, type: cell, value: resourceValue(cell) });
    }
  }

  return {
    maxResource,
    resourcePath,
    expandedPath,
    pathLength: expandedPath.length - 1,
    start: posOfKey(startKey),
    dpStates: [],
    consideredResources: totalResources,
    note: ''
  };
}

// 独立于树形 DP 的暴力穷举法，交叉验证"自由起点"下的最大可采集资源值是否正确。
// 方法：最优采集子树的所有叶子必为金币（叶子若是陷阱，去掉它连通性不变且价值更高），
// 因此枚举【金币子集】，对每个子集求它们在树上的最小连通子树（Steiner 树，各金币间路径之并），
// 累加该连通子树内所有格子的资源值，取最大——完全不依赖上面的 DP，属于独立验证。
export function verifyResourceMaximization(inputMaze, options = {}) {
  const bruteForceCap = options.bruteForceCap ?? 12;
  const dp = solveResourceCollectOnly(inputMaze);
  if (dp.error) return { ...dp, bruteForceValue: null, isMaximal: null, verifyMethod: dp.error };

  const maze = normalizeMaze(inputMaze);
  const coins = findCells(maze, COIN);

  if (!coins.length) {
    return { ...dp, bruteForceValue: 0, isMaximal: dp.maxResource === 0, verifyMethod: '迷宫中没有金币，最大可采集资源为 0' };
  }

  if (coins.length > bruteForceCap) {
    return {
      ...dp,
      bruteForceValue: null,
      isMaximal: null,
      verifyMethod: `金币数 ${coins.length} 超过穷举验证上限 ${bruteForceCap}，跳过暴力验证；DP 基于完美迷宫求"最大权连通子树"，是精确最优解（自由起点，不经过起点 S）`
    };
  }

  // 与 DP 保持一致：把起点 S 也从可通行图中排除，金币间路径不得穿过 S。
  const startCell = findSingle(maze, START);
  const blocked = new Set();
  if (startCell) blocked.add(key(startCell.row, startCell.col));

  // 预存每个金币到其它金币的树上路径（唯一路径，绕开 S），用于拼接 Steiner 树。
  const pathCells = coins.map((a) => coins.map((b) => bfsPath(maze, a, b, blocked)));

  let best = 0;
  const n = coins.length;
  for (let mask = 1; mask < (1 << n); mask += 1) {
    const picked = [];
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) picked.push(i);
    // 以子集里第一个金币为基准，取它到其它金币的路径之并 = 该子集的最小连通子树。
    const base = picked[0];
    const cells = new Set();
    let reachable = true;
    for (const idx of picked) {
      const path = pathCells[base][idx];
      if (!path.length) { reachable = false; break; }
      for (const p of path) cells.add(key(p.row, p.col));
    }
    if (!reachable) continue;
    let value = 0;
    for (const cellKey of cells) {
      const [r, c] = cellKey.split(',').map(Number);
      value += resourceValue(maze[r][c]);
    }
    if (value > best) best = value;
  }

  return {
    ...dp,
    bruteForceValue: best,
    isMaximal: best === dp.maxResource,
    verifyMethod: `穷举法：枚举 ${coins.length} 个金币的所有子集，对每个子集求其在树上的最小连通子树价值，取最大后与 DP 比对（自由起点）`
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
