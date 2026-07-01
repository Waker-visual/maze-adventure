import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMaze, validateMaze, compareGenerators } from './algorithms/mazeGenerator.js';
import { solveResourcePath } from './algorithms/resourceDp.js';
import { solveBossGroup, simulateBossBattle } from './algorithms/bossSolver.js';
import { simulateAi, AI_STRATEGIES } from './algorithms/aiPlayer.js';
import { greedyStep, evaluateGreedy } from './algorithms/greedyVision.js';
import { runCrossTest } from './algorithms/crossTest.js';
import { ALGORITHM_INFO } from './algorithms/algorithmInfo.js';
import { matrixToText, normalizeMaze } from './algorithms/mazeUtils.js';
import { checkSubmission } from './algorithms/submissionCheck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function ok(data) {
  return { success: true, ...data };
}

function fail(error) {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

app.get('/api/sample', (req, res) => {
  const samplePath = path.join(__dirname, 'data', 'maze_15_15.json');
  res.json(JSON.parse(fs.readFileSync(samplePath, 'utf8')));
});

app.post('/api/maze/generate', (req, res) => {
  try {
    const result = generateMaze(req.body ?? {});
    res.json(ok({ data: result, matrixText: matrixToText(result.maze) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/maze/validate', (req, res) => {
  try {
    const maze = normalizeMaze(req.body.maze ?? req.body);
    res.json(ok({ validation: validateMaze(maze), matrixText: matrixToText(maze) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/maze/compare', (req, res) => {
  try {
    res.json(ok({ data: compareGenerators(req.body ?? {}) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.get('/api/algorithm/info', (req, res) => {
  res.json(ok({ data: ALGORITHM_INFO }));
});

app.post('/api/resource/optimal-path', (req, res) => {
  try {
    const maze = normalizeMaze(req.body.maze ?? req.body);
    res.json(ok({ data: solveResourcePath(maze) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/boss/solve', (req, res) => {
  try {
    res.json(ok({ data: solveBossGroup(req.body ?? {}) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/boss/battle', (req, res) => {
  try {
    res.json(ok({ data: simulateBossBattle(req.body ?? {}) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/ai/simulate', (req, res) => {
  try {
    res.json(ok({ data: simulateAi(req.body ?? {}), strategies: AI_STRATEGIES }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/ai/greedy-step', (req, res) => {
  try {
    const maze = normalizeMaze(req.body.maze ?? req.body);
    const position = req.body.position ?? { row: 1, col: 1 };
    res.json(ok({ data: greedyStep(maze, position) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/ai/greedy-benchmark', (req, res) => {
  try {
    res.json(ok({ data: evaluateGreedy(req.body ?? {}) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/maze/legality', (req, res) => {
  try {
    res.json(ok({ data: checkSubmission(req.body ?? {}, { requiredSize: req.body?.requiredSize ?? 15 }) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/cross-test', (req, res) => {
  try {
    res.json(ok({ data: runCrossTest(req.body ?? {}) }));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.listen(port, () => {
  console.log(`Maze Adventure API running at http://localhost:${port}`);
});
