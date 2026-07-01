// 四种迷宫生成范式的时间/空间复杂度与特性元数据。
// n 表示 n×n 迷宫的边长，单元格总数为 N = n²；复杂度按单元格数 N 计。
export const ALGORITHM_INFO = {
  dfs: {
    key: 'dfs',
    name: '回溯 / DFS',
    paradigm: '回溯 (Backtracking)',
    time: 'O(N)',
    space: 'O(N)',
    extraSpace: '显式栈 O(N)',
    idea: '从起点深度优先随机雕刻，遇死路回溯，天然生成唯一通路的完美迷宫。',
    challenge: '走廊长、迂回度高、岔路深，探险路径富有挑战性。'
  },
  prim: {
    key: 'prim',
    name: '贪心 / 最小生成树 (Prim)',
    paradigm: '贪心 (Greedy / MST)',
    time: 'O(N log N)',
    space: 'O(N)',
    extraSpace: '边界集合 O(N)',
    idea: '以 Prim 思想从随机边界中贪心扩展生成树，等价于在网格图上构造最小生成树。',
    challenge: '岔路分布均匀、短支较多，整体较易但分支密集。'
  },
  divide: {
    key: 'divide',
    name: '分治 (Recursive Division)',
    paradigm: '分治 (Divide & Conquer)',
    time: 'O(N log N)',
    space: 'O(log N)',
    extraSpace: '递归栈 O(log N)',
    idea: '递归地用墙把空房间二分并开一道门，子区域继续分治，自顶向下构造迷宫。',
    challenge: '房间式结构、长直墙体，宏观区块感强、视觉规整。'
  },
  branch: {
    key: 'branch',
    name: '分支限界 / BFS',
    paradigm: '分支限界 (Branch & Bound)',
    time: 'O(N log N)',
    space: 'O(N)',
    extraSpace: '优先边界 O(N)',
    idea: '以带评分的优先边界做有界 BFS 扩展，优先朝远离起点的分支推进并裁剪低分前沿。',
    challenge: '主干向远端延伸、终点更深，限界裁剪带来不规则的强挑战布局。'
  }
};

export const ALGORITHM_KEYS = Object.keys(ALGORITHM_INFO);
