<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
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
  bossResult: null,
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

async function solveBoss() {
  try {
    const payload = readPayload();
    const result = await api.boss(payload);
    state.bossResult = result.data;
    setOutput('BOSS 分支限界策略', result.data);
  } catch (error) {
    state.output = `BOSS 求解失败：${error.message}`;
  }
}

async function runBossBattle() {
  try {
    const payload = readPayload();
    const result = await api.bossBattle({ ...payload, coins: 50 });
    setOutput('BOSS 实战推演（复活 / GAME OVER）', result.data);
  } catch (error) {
    state.output = `BOSS 实战失败：${error.message}`;
  }
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
    currentAi: highlighted.currentAi === id
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
        <button title="求解 BOSS 最少回合与技能序列" @click="solveBoss">BOSS</button>
        <button title="BOSS 实战：复活与 GAME OVER 推演" @click="runBossBattle">BOSS 实战</button>
        <button title="贪心 3×3 实时拾取多用例评测" @click="runGreedyBenchmark">贪心评测</button>
        <button title="迷宫 × AI 交叉测试矩阵" @click="runCrossTest" :disabled="state.running">交叉测试</button>
        <button title="运行 AI 玩家" class="primary" @click="runAi">AI 调试</button>
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
        </footer>
      </section>

      <aside class="side-panels">
        <section class="panel input-panel">
          <div class="panel-title">
            <h2>迷宫编辑区（输入）</h2>
            <div class="mini-actions">
              <button title="载入样例" @click="useSample">样例</button>
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
  </main>
</template>
