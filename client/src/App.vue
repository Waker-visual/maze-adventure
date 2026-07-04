<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { api, loadSample } from './api/mazeApi.js';
import localSample from './maze_15_15.json';

const state = reactive({
  size: 15,
  algorithm: 'dfs',
  coinCount: 8,
  trapCount: 5,
  seed: '',
  strategy: 'greedy',
  activeTab: 'json',
  mazeData: localSample,
  jsonText: JSON.stringify(localSample, null, 2),
  output: '等待运行。',
  validation: null,
  resourceResult: null,
  collectTestResult: null,
  bossResult: null,
  battleResult: null,
  aiResult: null,
  metrics: null,
  snapshots: [],
  hoverCell: null,
  running: false,
  leaderName: ''
});

const highlighted = reactive({
  resourcePath: new Map(),
  aiPath: new Map(),
  currentAi: ''
});

let timer = null;
const fileInputRef = ref(null);

// 人工玩家：用键盘（方向键 / WASD）在迷宫里移动，若恰好沿"最佳路径"（起点到终点的最短通路）
// 抵达终点 E，则弹出金色 "Congratulations" 庆祝弹窗并撒彩带。
const human = reactive({
  active: false,
  pos: null,
  trail: [],
  trailSet: new Set(),
  optimalPath: [],
  optimalSet: new Set(),
  showHint: true,
  ended: false,
  win: false,
  message: ''
});
const confetti = ref([]);

// BOSS 结果可视化弹窗：kind='solve' 展示分支限界攻略，kind='battle' 展示实战推演时间线。
const bossModal = reactive({ open: false, kind: null });

const maze = computed(() => state.mazeData?.maze ?? []);
const rows = computed(() => maze.value.length);
const cols = computed(() => maze.value[0]?.length ?? 0);
const cellSize = computed(() => {
  const largest = Math.max(rows.value, cols.value, 1);
  return `minmax(18px, ${Math.max(24, Math.min(42, Math.floor(720 / largest)))}px)`;
});

function pointKey(point) {
  return `${point.row},${point.col}`;
}

function matrixText(matrix = maze.value) {
  return matrix.map((row) => row.join('')).join('\n');
}

function matrixTextWithHint() {
  return `${matrixText()}\n\n---\n（提示：以上是左侧"迷宫编辑区"当前的迷宫矩阵，与下方功能按钮触发的结果无关）`;
}

function readPayload() {
  const parsed = JSON.parse(state.jsonText);
  if (!Array.isArray(parsed.maze)) throw new Error('JSON 中必须包含 maze 二维数组');
  return parsed;
}

function setMazeData(payload) {
  state.mazeData = payload;
  state.jsonText = JSON.stringify(payload, null, 2);
}

function setOutput(title, data) {
  state.output = `${title}\n\n${JSON.stringify(data, null, 2)}`;
}

async function useSample() {
  try {
    const sample = await loadSample();
    setMazeData(sample);
    setOutput('已载入 maze_15_15.json 样例', sample);
  } catch {
    setMazeData(localSample);
    setOutput('已载入本地样例', localSample);
  }
}

async function generateMaze() {
  clearAnimation();
  state.running = true;
  try {
    const base = readPayload();
    const result = await api.generate({
      ...base,
      size: state.size,
      algorithm: state.algorithm,
      coinCount: state.coinCount,
      trapCount: state.trapCount,
      seed: state.seed === '' ? undefined : state.seed
    });
    setMazeData({
      maze: result.data.maze,
      B: result.data.B,
      PlayerSkills: result.data.PlayerSkills,
      minRouds: result.data.minRouds,
      CoinConsumption: result.data.CoinConsumption
    });
    state.validation = result.data.validation;
    state.metrics = result.data.metrics;
    state.snapshots = result.data.snapshots ?? [];
    setOutput('迷宫生成结果', { validation: state.validation, metrics: state.metrics, matrix: result.matrixText });
  } catch (error) {
    state.output = `生成失败：${error.message}`;
  } finally {
    state.running = false;
  }
}

async function validateMaze() {
  try {
    const payload = readPayload();
    const result = await api.validate(payload);
    state.validation = result.validation;
    setOutput('迷宫校验结果', result.validation);
  } catch (error) {
    state.output = `校验失败：${error.message}`;
  }
}

async function solveResource() {
  clearAnimation();
  try {
    const payload = readPayload();
    const result = await api.resourcePath(payload);
    state.resourceResult = result.data;
    setOutput('动态规划资源路径', result.data);
    animateResourcePath(result.data.expandedPath ?? []);
  } catch (error) {
    state.output = `DP 计算失败：${error.message}`;
  }
}

// 资源收集路径测试：检查资源收集是否已最大化、给出路径长度，收集完最优资源即可停止（不必走到终点）。
async function runResourceCollectTest() {
  clearAnimation();
  try {
    const payload = readPayload();
    const result = await api.resourceCollectTest(payload);
    state.collectTestResult = result.data;
    setOutput('资源收集路径测试（无需走到终点，收集完最优资源即可停止）', result.data);
    animateResourcePath(result.data.expandedPath ?? []);
  } catch (error) {
    state.output = `资源收集测试失败：${error.message}`;
  }
}

function triggerFileImport() {
  fileInputRef.value?.click();
}

// 从本地导入 JSON 文件：含 maze 字段则整体替换当前迷宫；
// 只含 B / PlayerSkills 等字段（例如老师发的 boss_case_N.json）则合并进当前迷宫，不覆盖 maze。
function handleFileImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (Array.isArray(parsed.maze)) {
        setMazeData(parsed);
        setOutput(`✓ 已从文件导入迷宫：${file.name}`, parsed);
      } else if ('B' in parsed || 'PlayerSkills' in parsed || 'minRouds' in parsed || 'CoinConsumption' in parsed) {
        const merged = { ...state.mazeData };
        for (const field of ['B', 'PlayerSkills', 'minRouds', 'CoinConsumption']) {
          if (field in parsed) merged[field] = parsed[field];
        }
        setMazeData(merged);
        setOutput(`✓ 已从文件合并 BOSS/参数配置（文件不含 maze，保留当前迷宫矩阵）：${file.name}`, merged);
      } else {
        state.output = `导入失败：${file.name} 中既没有 maze 字段，也没有 B/PlayerSkills 等字段`;
      }
    } catch (error) {
      state.output = `导入失败：${error.message}`;
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}

async function solveBoss() {
  try {
    const payload = readPayload();
    const result = await api.boss(payload);
    state.bossResult = result.data;
    setOutput('BOSS 分支限界策略', result.data);
    openBossModal('solve');
  } catch (error) {
    state.output = `BOSS 求解失败：${error.message}`;
  }
}

async function runBossBattle() {
  try {
    const payload = readPayload();
    const result = await api.bossBattle({ ...payload, coins: 50 });
    state.battleResult = result.data;
    setOutput('BOSS 实战推演（复活 / GAME OVER）', result.data);
    openBossModal('battle');
  } catch (error) {
    state.output = `BOSS 实战失败：${error.message}`;
  }
}

function openBossModal(kind) {
  bossModal.kind = kind;
  bossModal.open = true;
}

function closeBossModal() {
  bossModal.open = false;
}

// 把技能 id 映射回本场 BOSS 的技能对象，用于在序列里显示伤害等信息。
function skillOf(boss, skillId) {
  return boss.skills?.find((s) => s.id === skillId) ?? null;
}

function skillLabel(boss, skillId) {
  const s = skillOf(boss, skillId);
  return s ? `${s.name}(-${s.damage})` : skillId;
}

// 每个技能在血条上占据的一段，宽度按该技能伤害占 BOSS 总血量的比例。
function hpSegStyle(boss, skillId, index) {
  const s = skillOf(boss, skillId);
  const dmg = s ? s.damage : 0;
  const pct = boss.hp > 0 ? Math.min(100, (dmg / boss.hp) * 100) : 0;
  return { width: `${pct}%`, '--seg-index': index };
}

function battleEventIcon(ev) {
  return { defeated: '✅', revive: '💰', 'game-over': '☠️', unbeatable: '🚫' }[ev.event] ?? '•';
}

function battleEventText(ev) {
  switch (ev.event) {
    case 'defeated':
      return `BOSS ${ev.bossIndex + 1}（HP ${ev.hp}）被击败，本条命用 ${ev.roundsThisLife} 回合`;
    case 'revive':
      return `BOSS ${ev.bossIndex + 1}（HP ${ev.hp}）未在回合内击败，消耗 ${ev.cost} 金币复活`;
    case 'game-over':
      return `BOSS ${ev.bossIndex + 1}（HP ${ev.hp}）处金币耗尽 —— ${ev.reason}`;
    case 'unbeatable':
      return `BOSS ${ev.bossIndex + 1}（HP ${ev.hp}）无法击败：${ev.reason}`;
    default:
      return ev.event;
  }
}

function coinPercent(result) {
  if (!result || !result.startCoins) return 0;
  return Math.max(0, Math.min(100, (result.remainingCoins / result.startCoins) * 100));
}

async function compareAlgorithms() {
  state.running = true;
  try {
    const result = await api.compare({
      size: state.size,
      rounds: 3,
      seed: state.seed === '' ? undefined : state.seed
    });
    const table = result.data.results.map((row) => ({
      算法: row.info?.name ?? row.algorithm,
      时间复杂度: row.info?.time,
      空间复杂度: row.info?.space,
      平均耗时ms: row.avgTimeMs,
      平均挑战分: row.avgChallengeScore,
      连通率: row.connectedRate,
      唯一通路率: row.uniquePathRate
    }));
    setOutput('四算法复杂度与指标对比', { size: result.data.size, rounds: result.data.rounds, table });
  } catch (error) {
    state.output = `算法对比失败：${error.message}`;
  } finally {
    state.running = false;
  }
}

async function runGreedyBenchmark() {
  try {
    const result = await api.greedyBenchmark({});
    setOutput('贪心 3×3 实时拾取评测（多用例均值）', result.data);
  } catch (error) {
    state.output = `贪心评测失败：${error.message}`;
  }
}

async function checkLegality() {
  try {
    const payload = readPayload();
    const result = await api.legality(payload);
    setOutput(result.data.valid ? '✓ 合法性自检通过' : '✗ 合法性自检未通过', result.data);
  } catch (error) {
    state.output = `合法性自检失败：${error.message}`;
  }
}

async function runCrossTest() {
  state.running = true;
  try {
    const base = readPayload();
    const seeds = [['dfs', 'ct-dfs'], ['prim', 'ct-prim'], ['branch', 'ct-branch']];
    const generated = await Promise.all(
      seeds.map(([algorithm, seed]) =>
        api.generate({ ...base, size: state.size, algorithm, seed }).then((r) => ({
          name: algorithm,
          maze: r.data.maze,
          B: r.data.B,
          PlayerSkills: r.data.PlayerSkills,
          minRouds: r.data.minRouds,
          CoinConsumption: r.data.CoinConsumption
        }))
      )
    );
    const mazes = [{ name: '当前迷宫', ...base }, ...generated];
    const result = await api.crossTest({ mazes });
    setOutput('交叉测试矩阵（迷宫 × AI）', {
      aiScores: result.data.aiScores,
      mazeScores: result.data.mazeScores,
      matrix: result.data.matrix
    });
  } catch (error) {
    state.output = `交叉测试失败：${error.message}`;
  } finally {
    state.running = false;
  }
}

async function runAi() {
  clearHighlights();
  try {
    const payload = readPayload();
    const result = await api.ai({ ...payload, strategy: state.strategy });
    state.aiResult = result.data;
    setOutput(`AI 玩家调试结果（策略：${state.strategy}）`, result.data);
    animatePath(result.data.path ?? []);
  } catch (error) {
    state.output = `AI 调试失败：${error.message}`;
  }
}

function clearHighlights() {
  highlighted.resourcePath = new Map();
  highlighted.aiPath = new Map();
  highlighted.currentAi = '';
}

function clearAnimation() {
  if (timer) window.clearInterval(timer);
  timer = null;
  clearHighlights();
}

function playGeneration() {
  clearAnimation();
  if (!state.snapshots.length) {
    state.output = '当前没有生成过程快照，请先生成迷宫。';
    return;
  }
  let index = 0;
  timer = window.setInterval(() => {
    state.mazeData = { ...state.mazeData, maze: state.snapshots[index] };
    index += 1;
    if (index >= state.snapshots.length) {
      clearAnimation();
      state.jsonText = JSON.stringify(state.mazeData, null, 2);
    }
  }, 80);
}

function animatePath(path) {
  let index = 0;
  timer = window.setInterval(() => {
    if (index >= path.length) {
      window.clearInterval(timer);
      timer = null;
      return;
    }
    const current = path[index];
    addPathVisit(highlighted.aiPath, current);
    highlighted.currentAi = pointKey(current);
    index += 1;
  }, 70);
}

// 逐格揭示动态规划得到的最优资源收集路径，可视化展示 DP 过程。
function animateResourcePath(path) {
  let index = 0;
  timer = window.setInterval(() => {
    if (index >= path.length) {
      window.clearInterval(timer);
      timer = null;
      highlighted.currentAi = '';
      return;
    }
    const current = path[index];
    addPathVisit(highlighted.resourcePath, current);
    highlighted.currentAi = pointKey(current);
    index += 1;
  }, 60);
}

function addPathVisit(pathMap, point) {
  const id = pointKey(point);
  pathMap.set(id, (pathMap.get(id) ?? 0) + 1);
}

function copyOutput() {
  navigator.clipboard?.writeText(state.output);
}

function downloadJson() {
  const blob = new Blob([state.jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'best_maze.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

// 导出最终提交版：命名统一为 best_maze_design_组长名.json，导出前先跑一遍合法性自检。
async function exportSubmission() {
  const leader = state.leaderName.trim();
  if (!leader) {
    state.output = '请先在"组长姓名"输入框中填写组长姓名，再导出最终版。';
    return;
  }
  let payload;
  try {
    payload = readPayload();
  } catch (error) {
    state.output = `导出失败：${error.message}`;
    return;
  }
  try {
    const result = await api.legality(payload);
    if (!result.data.valid) {
      setOutput('✗ 导出已取消：合法性自检未通过，请先修复以下问题', result.data);
      return;
    }
  } catch (error) {
    state.output = `导出前合法性自检失败：${error.message}`;
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `best_maze_design_${leader}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setOutput(`✓ 已导出 best_maze_design_${leader}.json（合法性自检通过）`, payload);
}

// ===== 人工玩家 =====
function findCellChar(ch) {
  const grid = maze.value;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c += 1) {
      if (grid[r][c] === ch) return { row: r, col: c };
    }
  }
  return null;
}

// 起点 S 到终点 E 的最短通路（完美迷宫里唯一），即"最佳路径"。
function computeOptimalPath() {
  const grid = maze.value;
  const start = findCellChar('S');
  const end = findCellChar('E');
  if (!start || !end) return [];
  const rowsN = grid.length;
  const colsN = grid[0]?.length ?? 0;
  const visited = Array.from({ length: rowsN }, () => Array(colsN).fill(false));
  const prev = new Map();
  const queue = [start];
  visited[start.row][start.col] = true;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let found = false;
  while (queue.length) {
    const cur = queue.shift();
    if (cur.row === end.row && cur.col === end.col) { found = true; break; }
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (nr < 0 || nc < 0 || nr >= rowsN || nc >= colsN) continue;
      if (visited[nr][nc] || grid[nr][nc] === '#') continue;
      visited[nr][nc] = true;
      prev.set(`${nr},${nc}`, cur);
      queue.push({ row: nr, col: nc });
    }
  }
  if (!found) return [];
  const path = [];
  let cur = end;
  while (cur) {
    path.push(cur);
    if (cur.row === start.row && cur.col === start.col) break;
    cur = prev.get(`${cur.row},${cur.col}`);
  }
  return path.reverse();
}

function startHumanPlayer() {
  clearAnimation();
  const start = findCellChar('S');
  const end = findCellChar('E');
  if (!start || !end) {
    state.output = '人工玩家启动失败：迷宫缺少起点 S 或终点 E。';
    return;
  }
  const optimal = computeOptimalPath();
  human.active = true;
  human.pos = { row: start.row, col: start.col };
  human.trail = [{ row: start.row, col: start.col }];
  human.trailSet = new Set([pointKey(start)]);
  human.optimalPath = optimal;
  human.optimalSet = new Set(optimal.map((p) => pointKey(p)));
  human.showHint = true;
  human.ended = false;
  human.win = false;
  human.message = '';
  confetti.value = [];
  setOutput('人工玩家已启动', {
    操作: '方向键 ↑↓←→ 或 W/A/S/D 移动',
    目标: '沿最佳路径走到终点 E',
    最佳路径步数: Math.max(0, optimal.length - 1)
  });
}

function resetHumanPlayer() {
  const start = findCellChar('S');
  if (!start) return;
  human.pos = { row: start.row, col: start.col };
  human.trail = [{ row: start.row, col: start.col }];
  human.trailSet = new Set([pointKey(start)]);
  human.ended = false;
  human.win = false;
  human.message = '';
  confetti.value = [];
}

function exitHumanPlayer() {
  human.active = false;
  human.pos = null;
  human.trail = [];
  human.trailSet = new Set();
  human.optimalPath = [];
  human.optimalSet = new Set();
  human.ended = false;
  human.win = false;
  human.message = '';
  confetti.value = [];
}

function trailMatchesOptimal() {
  const t = human.trail;
  const o = human.optimalPath;
  if (!o.length || t.length !== o.length) return false;
  return t.every((p, i) => p.row === o[i].row && p.col === o[i].col);
}

function moveHuman(dr, dc) {
  if (!human.active || human.win) return;
  const grid = maze.value;
  const nr = human.pos.row + dr;
  const nc = human.pos.col + dc;
  if (nr < 0 || nc < 0 || nr >= grid.length || nc >= (grid[nr]?.length ?? 0)) return;
  if (grid[nr][nc] === '#') return;
  human.pos = { row: nr, col: nc };
  human.trail.push({ row: nr, col: nc });
  human.trailSet.add(`${nr},${nc}`);
  human.ended = false;
  human.message = '';
  if (grid[nr][nc] === 'E') finishHuman();
}

function finishHuman() {
  human.ended = true;
  if (trailMatchesOptimal()) {
    human.win = true;
    launchConfetti();
  } else {
    human.win = false;
    const steps = human.trail.length - 1;
    const best = Math.max(0, human.optimalPath.length - 1);
    human.message = `到达终点，但不是最佳路径（你走了 ${steps} 步，最佳为 ${best} 步）。点击"重来"再挑战一次。`;
  }
}

function launchConfetti() {
  const colors = ['#f7d84a', '#ffd166', '#ffb703', '#ff5c73', '#65d6ff', '#48df7b', '#b37cff', '#fff3a3'];
  const pieces = [];
  for (let i = 0; i < 96; i += 1) {
    pieces.push({
      id: i,
      left: Math.round(Math.random() * 100),
      delay: (Math.random() * 0.9).toFixed(2),
      duration: (2.4 + Math.random() * 2.2).toFixed(2),
      color: colors[i % colors.length],
      size: 6 + Math.round(Math.random() * 8),
      drift: (Math.random() * 2 - 1).toFixed(2)
    });
  }
  confetti.value = pieces;
}

function confettiStyle(piece) {
  return {
    left: `${piece.left}%`,
    width: `${piece.size}px`,
    height: `${Math.round(piece.size * 1.8)}px`,
    background: piece.color,
    animationDelay: `${piece.delay}s`,
    animationDuration: `${piece.duration}s`,
    '--drift': piece.drift
  };
}

function closeCongrats() {
  human.win = false;
  confetti.value = [];
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (human.win) { closeCongrats(); return; }
    if (bossModal.open) { closeBossModal(); return; }
  }
  if (!human.active) return;
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  let handled = true;
  switch (event.key) {
    case 'ArrowUp': case 'w': case 'W': moveHuman(-1, 0); break;
    case 'ArrowDown': case 's': case 'S': moveHuman(1, 0); break;
    case 'ArrowLeft': case 'a': case 'A': moveHuman(0, -1); break;
    case 'ArrowRight': case 'd': case 'D': moveHuman(0, 1); break;
    default: handled = false;
  }
  if (handled) event.preventDefault();
}

function cellClass(cell, row, col) {
  const id = `${row},${col}`;
  const resourceVisits = highlighted.resourcePath.get(id) ?? 0;
  const aiVisits = highlighted.aiPath.get(id) ?? 0;
  return {
    cell: true,
    wall: cell === '#',
    road: cell === ' ',
    start: cell === 'S',
    end: cell === 'E',
    coin: cell === 'G',
    trap: cell === 'T',
    boss: cell === 'B',
    resourcePath: resourceVisits > 0,
    resourceRepeat: resourceVisits > 1,
    aiPath: aiVisits > 0,
    aiRepeat: aiVisits > 1,
    aiHeavyRepeat: aiVisits > 2,
    currentAi: highlighted.currentAi === id,
    optimalHint: human.active && human.showHint && human.optimalSet.has(id),
    humanTrail: human.active && human.trailSet.has(id),
    humanPlayer: human.active && human.pos?.row === row && human.pos?.col === col
  };
}

function cellStyle(row, col) {
  const id = `${row},${col}`;
  const aiVisits = highlighted.aiPath.get(id) ?? 0;
  const resourceVisits = highlighted.resourcePath.get(id) ?? 0;
  return {
    '--ai-visits': Math.min(aiVisits, 5),
    '--resource-visits': Math.min(resourceVisits, 5)
  };
}

function pathVisitLabel(row, col) {
  const id = `${row},${col}`;
  const visits = Math.max(highlighted.aiPath.get(id) ?? 0, highlighted.resourcePath.get(id) ?? 0);
  return visits > 1 ? String(visits) : '';
}

function cellLabel(cell) {
  if (cell === ' ') return '';
  return cell;
}

function hover(cell, row, col) {
  state.hoverCell = { row, col, cell };
}

// B 格子在矩阵里只显示一个字符，但 JSON 中的 B 数组可能包含多场连续 BOSS 战
// （技能冷却在几场之间继承），这里把这个隐藏信息在状态栏里显式提示出来。
function bossHoverHint() {
  if (state.hoverCell?.cell !== 'B') return '';
  const bosses = state.mazeData?.B ?? [];
  if (!bosses.length) return '（该格子对应的 B 数组为空）';
  return `此格触发连续 ${bosses.length} 场 BOSS 战，血量依次为 [${bosses.join(', ')}]（技能冷却在几场之间继承）`;
}

onMounted(useSample);
onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <main class="app-shell">
    <header class="toolbar">
      <div class="brand">
        <span class="brand-mark">C</span>
        <div>
          <h1>算法迷宫探险实验室</h1>
          <p>迷宫设计任务 · Pac-Man 风格 · 标准 JSON 输入输出</p>
        </div>
      </div>
      <div class="tool-actions">
        <button title="生成迷宫" @click="generateMaze" :disabled="state.running">生成</button>
        <button title="播放生成过程" @click="playGeneration">播放</button>
        <button title="四算法复杂度与指标对比" @click="compareAlgorithms" :disabled="state.running">算法对比</button>
        <button title="验证迷宫" @click="validateMaze">验证</button>
        <button title="提交前合法性自检：格式/起终点/连通性/资源与陷阱/BOSS参数" @click="checkLegality">合法性自检</button>
        <button title="动态规划资源路径并可视化" @click="solveResource">DP 路径</button>
        <button title="资源收集路径测试：检查资源收集是否已最大化、显示路径长度，收集完最优资源即可停止，无需走到终点" @click="runResourceCollectTest">资源收集测试</button>
        <button title="求解 BOSS 最少回合与技能序列" @click="solveBoss">BOSS</button>
        <button title="BOSS 实战：复活与 GAME OVER 推演" @click="runBossBattle">BOSS 实战</button>
        <button title="贪心 3×3 实时拾取多用例评测" @click="runGreedyBenchmark">贪心评测</button>
        <button title="迷宫 × AI 交叉测试矩阵" @click="runCrossTest" :disabled="state.running">交叉测试</button>
        <button title="运行 AI 玩家" class="primary" @click="runAi">AI 调试</button>
        <button title="人工玩家：用方向键 / WASD 沿最佳路径走到终点" @click="startHumanPlayer">人工玩家</button>
      </div>
    </header>

    <section class="workspace">
      <section class="maze-stage">
        <div class="maze-header">
          <div>
            <strong>{{ rows }}×{{ cols }}</strong>
            <span v-if="state.metrics">挑战分 {{ state.metrics.challengeScore }}</span>
          </div>
          <div class="legend">
            <span><i class="l start"></i>S</span>
            <span><i class="l coin"></i>G</span>
            <span><i class="l trap"></i>T</span>
            <span title="矩阵中只显示一个 B 字符，但 JSON 里的 B 数组可包含多场连续 BOSS 战"><i class="l boss"></i>B（可含多场）</span>
            <span><i class="l end"></i>E</span>
          </div>
        </div>

        <div v-if="human.active" class="human-hud">
          <span class="hud-title">🎮 人工玩家</span>
          <span class="hud-hint">方向键 / WASD 移动</span>
          <span class="hud-steps">步数 {{ human.trail.length - 1 }} · 最佳 {{ Math.max(0, human.optimalPath.length - 1) }}</span>
          <label class="hud-toggle"><input type="checkbox" v-model="human.showHint" /> 显示最佳路径</label>
          <button @click="resetHumanPlayer">重来</button>
          <button @click="exitHumanPlayer">退出</button>
          <span v-if="human.ended && !human.win" class="hud-msg">{{ human.message }}</span>
        </div>

        <div class="maze-wrap">
          <div
            class="maze-grid"
            :style="{ gridTemplateColumns: `repeat(${cols}, ${cellSize})` }"
          >
            <div
              v-for="(cell, index) in maze.flat()"
              :key="index"
              :class="cellClass(cell, Math.floor(index / cols), index % cols)"
              :style="cellStyle(Math.floor(index / cols), index % cols)"
              @mouseenter="hover(cell, Math.floor(index / cols), index % cols)"
            >
              <span>{{ cellLabel(cell) }}</span>
              <b v-if="pathVisitLabel(Math.floor(index / cols), index % cols)" class="visit-count">
                {{ pathVisitLabel(Math.floor(index / cols), index % cols) }}
              </b>
            </div>
          </div>
        </div>

        <footer class="statusbar">
          <span v-if="state.hoverCell">
            坐标 ({{ state.hoverCell.row }}, {{ state.hoverCell.col }})：{{ state.hoverCell.cell === ' ' ? '通路' : state.hoverCell.cell }}
            <template v-if="bossHoverHint()"> · {{ bossHoverHint() }}</template>
          </span>
          <span v-else>移动到格子上查看坐标和类型（B 格子会显示其对应的连续 BOSS 战信息）</span>
          <span v-if="state.validation">连通：{{ state.validation.connected ? '是' : '否' }} · 唯一路径：{{ state.validation.uniquePath ? '是' : '否' }}</span>
          <span v-if="state.collectTestResult">
            资源收集测试 ·
            <template v-if="state.collectTestResult.start">最优起点 ({{ state.collectTestResult.start.row }}, {{ state.collectTestResult.start.col }}) · </template>
            路径长度 {{ state.collectTestResult.pathLength }} · 收集资源 {{ state.collectTestResult.maxResource }} ·
            <template v-if="state.collectTestResult.isMaximal === true">已验证最大化 ✓</template>
            <template v-else-if="state.collectTestResult.isMaximal === false">未达最大 ✗</template>
            <template v-else>资源较多，未穷举验证（DP 仍为精确最优解）</template>
          </span>
        </footer>
      </section>

      <aside class="side-panels">
        <section class="panel input-panel">
          <div class="panel-title">
            <h2>迷宫编辑区（输入）</h2>
            <div class="mini-actions">
              <button title="载入样例" @click="useSample">样例</button>
              <button title="从本地导入 JSON 文件：含 maze 则整体替换，只含 B/PlayerSkills 等字段则合并进当前迷宫" @click="triggerFileImport">导入文件</button>
              <input ref="fileInputRef" type="file" accept="application/json,.json" style="display:none" @change="handleFileImport" />
              <button title="下载当前迷宫 JSON（草稿，与右侧结果无关）" @click="downloadJson">下载迷宫</button>
              <button title="导出最终版：合法性自检通过后生成 best_maze_design_组长名.json" class="primary" @click="exportSubmission">导出最终版</button>
            </div>
          </div>
          <div class="form-grid">
            <label>尺寸 n<input type="number" min="9" max="51" step="2" v-model.number="state.size" /></label>
            <label>算法
              <select v-model="state.algorithm">
                <option value="dfs">回溯 / DFS</option>
                <option value="prim">贪心 / Prim</option>
                <option value="divide">分治</option>
                <option value="branch">分支限界 / BFS</option>
              </select>
            </label>
            <label>金币数<input type="number" min="0" max="30" v-model.number="state.coinCount" /></label>
            <label>陷阱数<input type="number" min="0" max="30" v-model.number="state.trapCount" /></label>
            <label>种子（可复现）<input type="text" placeholder="留空为随机" v-model="state.seed" /></label>
            <label>AI 策略
              <select v-model="state.strategy">
                <option value="greedy">贪心拾取</option>
                <option value="optimal">DP 最优</option>
                <option value="speedrun">竞速直达</option>
              </select>
            </label>
            <label>组长姓名（导出文件名用）<input type="text" placeholder="例如：张三" v-model="state.leaderName" /></label>
          </div>
          <textarea v-model="state.jsonText" spellcheck="false"></textarea>
        </section>

        <section class="panel output-panel">
          <div class="panel-title">
            <h2>结果窗口（上一次操作的输出）</h2>
            <div class="mini-actions">
              <button title="查看上一次操作的结果 JSON" @click="state.activeTab = 'json'">结果JSON</button>
              <button title="查看当前迷宫矩阵文本（即左侧编辑区内容，不随结果变化）" @click="state.activeTab = 'matrix'">迷宫矩阵</button>
              <button title="复制上一次操作的结果" @click="copyOutput">复制结果</button>
            </div>
          </div>
          <pre v-if="state.activeTab === 'json'">{{ state.output }}</pre>
          <pre v-else>{{ matrixTextWithHint() }}</pre>
        </section>
      </aside>
    </section>

    <!-- 人工玩家沿最佳路径通关：金色 Congratulations + 彩带 -->
    <div v-if="human.win" class="congrats-overlay" @click.self="closeCongrats">
      <div class="confetti-layer" aria-hidden="true">
        <i v-for="piece in confetti" :key="piece.id" class="confetti" :style="confettiStyle(piece)"></i>
      </div>
      <div class="congrats-card">
        <h2 class="congrats-title">Congratulations</h2>
        <p class="congrats-sub">你沿最佳路径抵达终点！</p>
        <p class="congrats-steps">用时 {{ human.trail.length - 1 }} 步（最佳路径）</p>
        <div class="congrats-actions">
          <button class="primary" @click="closeCongrats(); resetHumanPlayer();">再玩一次</button>
          <button @click="closeCongrats(); exitHumanPlayer();">退出</button>
        </div>
      </div>
    </div>

    <!-- BOSS 结果可视化弹窗 -->
    <div v-if="bossModal.open" class="boss-modal-overlay" @click.self="closeBossModal">
      <div class="boss-modal">
        <div class="boss-modal-head">
          <div class="boss-tabs">
            <button :class="{ active: bossModal.kind === 'solve' }" :disabled="!state.bossResult" @click="bossModal.kind = 'solve'">BOSS 攻略</button>
            <button :class="{ active: bossModal.kind === 'battle' }" :disabled="!state.battleResult" @click="bossModal.kind = 'battle'">实战推演</button>
          </div>
          <button class="close-x" title="关闭 (Esc)" @click="closeBossModal">✕</button>
        </div>

        <div class="boss-modal-body">
          <!-- 分支限界攻略：每个 BOSS 的血条 + 技能序列 -->
          <template v-if="bossModal.kind === 'solve' && state.bossResult">
            <div class="boss-summary">
              <span class="stat"><b>{{ state.bossResult.bossCount }}</b>个 BOSS</span>
              <span class="stat"><b>{{ state.bossResult.minTurns }}</b>最少总回合</span>
              <span class="stat"><b>{{ state.bossResult.turnLimit }}</b>回合/场上限</span>
              <span class="stat"><b>{{ state.bossResult.reviveCost }}</b>复活金币</span>
            </div>
            <p v-if="state.bossResult.warning" class="boss-warn">⚠ {{ state.bossResult.warning }}</p>
            <div class="boss-cards">
              <div v-for="b in state.bossResult.bosses" :key="b.bossIndex" class="boss-card">
                <div class="boss-card-head">
                  <span class="boss-name">BOSS {{ b.bossIndex + 1 }}</span>
                  <span class="boss-hp">HP {{ b.hp }}</span>
                  <span class="boss-turns" :class="{ over: b.minTurns == null || b.minTurns > state.bossResult.turnLimit }">
                    {{ b.minTurns == null ? '无解' : b.minTurns + ' 回合' }}
                  </span>
                </div>
                <div class="hp-bar">
                  <i
                    v-for="(sid, i) in b.bestSequence"
                    :key="i"
                    class="hp-seg"
                    :style="hpSegStyle(b, sid, i)"
                    :title="skillLabel(b, sid)"
                  ></i>
                </div>
                <div class="skill-seq">
                  <span v-for="(sid, i) in b.bestSequence" :key="i" class="skill-chip">
                    <b>{{ i + 1 }}</b>{{ skillLabel(b, sid) }}
                  </span>
                  <span v-if="!b.bestSequence.length" class="skill-empty">该 BOSS 无可行技能序列</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 实战推演：结果徽标 + 金币条 + 事件时间线 -->
          <template v-else-if="bossModal.kind === 'battle' && state.battleResult">
            <div class="battle-summary">
              <span class="result-badge" :class="state.battleResult.cleared ? 'win' : 'lose'">
                {{ state.battleResult.cleared ? '通关 ✓' : 'GAME OVER' }}
              </span>
              <span class="stat"><b>{{ state.battleResult.bossesDefeated }}/{{ state.battleResult.bossCount }}</b>击败</span>
              <span class="stat"><b>{{ state.battleResult.totalRounds }}</b>总回合</span>
              <span class="stat"><b>{{ state.battleResult.revives }}</b>次复活</span>
            </div>
            <div class="coin-track">
              <span class="coin-label">金币 {{ state.battleResult.startCoins }} → {{ state.battleResult.remainingCoins }}</span>
              <div class="coin-bar"><i :style="{ width: coinPercent(state.battleResult) + '%' }"></i></div>
            </div>
            <p v-if="state.battleResult.warning" class="boss-warn">⚠ {{ state.battleResult.warning }}</p>
            <ol class="battle-log">
              <li v-for="(ev, i) in state.battleResult.log" :key="i" :class="'ev-' + ev.event">
                <span class="ev-icon">{{ battleEventIcon(ev) }}</span>
                <span class="ev-text">{{ battleEventText(ev) }}</span>
                <span v-if="ev.coinsLeft != null" class="ev-coins">💰 {{ ev.coinsLeft }}</span>
              </li>
            </ol>
          </template>
        </div>
      </div>
    </div>
  </main>
</template>
