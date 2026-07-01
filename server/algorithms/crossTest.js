import { simulateAi, AI_STRATEGIES } from './aiPlayer.js';

// 交叉测试矩阵：把多个"最佳迷宫"组成基准集，让每个 AI 策略逐一通关，
// 得到 迷宫 × AI 的评分矩阵。每个迷宫的分数由全部 AI 的均值决定，
// 每个 AI 的分数由全部迷宫的均值决定（与交叉测试评分规则一致）。
export function runCrossTest(input = {}) {
  const mazes = Array.isArray(input.mazes) ? input.mazes : [];
  const strategyKeys = Array.isArray(input.strategies) && input.strategies.length
    ? input.strategies
    : AI_STRATEGIES.map((s) => s.key);

  const matrix = mazes.map((entry, mazeIndex) => {
    const mazeData = entry.maze ?? entry;
    const name = entry.name ?? `maze-${mazeIndex + 1}`;
    const scores = {};
    for (const strategy of strategyKeys) {
      const r = simulateAi({ ...entry, maze: mazeData, strategy });
      scores[strategy] = {
        success: r.success,
        steps: r.steps,
        remainingResource: r.remainingResource,
        scoreRatio: r.scoreRatio,
        coinsCollected: r.coinsCollected,
        trapsTriggered: r.trapsTriggered
      };
    }
    return { mazeIndex, name, scores };
  });

  const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

  // 每个迷宫分数 = 该行全部 AI 的 scoreRatio 均值。
  const mazeScores = matrix.map((row) => ({
    mazeIndex: row.mazeIndex,
    name: row.name,
    score: Number(mean(strategyKeys.map((k) => row.scores[k].scoreRatio)).toFixed(3))
  }));

  // 每个 AI 分数 = 该列全部迷宫的 scoreRatio 均值。
  const aiScores = strategyKeys.map((strategy) => ({
    strategy,
    name: AI_STRATEGIES.find((s) => s.key === strategy)?.name ?? strategy,
    score: Number(mean(matrix.map((row) => row.scores[strategy].scoreRatio)).toFixed(3)),
    clearRate: Number(mean(matrix.map((row) => (row.scores[strategy].success ? 1 : 0))).toFixed(2))
  }));

  return {
    mazeCount: mazes.length,
    strategies: strategyKeys,
    matrix,
    mazeScores,
    aiScores
  };
}
