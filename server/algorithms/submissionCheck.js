import { validateMaze } from './mazeGenerator.js';
import { normalizeSkills } from './bossSolver.js';
import { BOSS, COIN, TRAP, findCells, normalizeMaze } from './mazeUtils.js';

// 提交前合法性自检：对应验收现场的"文件格式、起点终点、连通性、
// 资源与陷阱设置、BOSS 参数"检查项，尽量在助教复检前把问题打回给自己。
export function checkSubmission(payload = {}, options = {}) {
  const requiredSize = Number(options.requiredSize ?? 15);
  const errors = [];
  const warnings = [];

  if (!Array.isArray(payload.maze)) {
    return { valid: false, errors: ['缺少 maze 二维数组'], warnings, mazeValidation: null };
  }

  let maze;
  try {
    maze = normalizeMaze(payload.maze);
  } catch (error) {
    return { valid: false, errors: [`maze 格式错误：${error.message}`], warnings, mazeValidation: null };
  }

  const mazeValidation = validateMaze(maze);
  if (!mazeValidation.valid) errors.push(...mazeValidation.errors.map((e) => `迷宫结构：${e}`));
  if (!mazeValidation.uniquePath) errors.push('迷宫结构：非完美迷宫（起点到各可通行格没有唯一通路，可能存在环路）');

  const rows = maze.length;
  const cols = maze[0]?.length ?? 0;
  if (rows !== requiredSize || cols !== requiredSize) {
    errors.push(`迷宫尺寸必须为 ${requiredSize}x${requiredSize}，当前为 ${rows}x${cols}`);
  }

  // BOSS 参数
  const bossCells = findCells(maze, BOSS);
  const bArray = Array.isArray(payload.B) ? payload.B : null;
  if (bossCells.length === 0) {
    warnings.push('迷宫中没有 B（BOSS）格子');
  }
  if (!bArray || bArray.length === 0) {
    errors.push('BOSS 参数：缺少 B（BOSS 血量数组）');
  } else {
    const badHp = bArray.filter((v) => !Number.isFinite(Number(v)) || Number(v) <= 0);
    if (badHp.length) errors.push(`BOSS 参数：B 数组中存在非法血量 ${JSON.stringify(badHp)}`);
  }

  const skills = normalizeSkills(payload.PlayerSkills);
  const rawSkillCount = Array.isArray(payload.PlayerSkills) ? payload.PlayerSkills.length : 0;
  if (rawSkillCount < 2) {
    errors.push('PlayerSkills：技能数量过少（至少 2 个）');
  }
  if (skills.length !== rawSkillCount) {
    errors.push('PlayerSkills：存在非法技能项（伤害必须 >0，冷却必须 >=0）');
  }
  const hasNoCooldownSkill = skills.some((skill) => skill.cooldown === 0);
  if (!hasNoCooldownSkill) {
    errors.push('PlayerSkills：必须至少包含一个无冷却技能（冷却为 0），防止空窗期');
  }

  const minRouds = Number(payload.minRouds ?? payload.minRounds);
  if (!Number.isFinite(minRouds) || minRouds <= 0 || !Number.isInteger(minRouds)) {
    errors.push('minRouds：必须为正整数（单条命可用回合上限）');
  }

  const coinConsumption = Number(payload.CoinConsumption);
  if (!Number.isFinite(coinConsumption) || coinConsumption < 0) {
    errors.push('CoinConsumption：必须为非负数（复活所需金币数）');
  }

  // 资源与陷阱设置
  const coinCells = findCells(maze, COIN);
  const trapCells = findCells(maze, TRAP);
  if (coinCells.length === 0) warnings.push('迷宫中没有金币（G），资源收集环节会失去意义');
  if (trapCells.length === 0) warnings.push('迷宫中没有陷阱（T），挑战性可能不足');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mazeValidation,
    summary: {
      size: { rows, cols },
      bossCellCount: bossCells.length,
      bossHpCount: bArray?.length ?? 0,
      coinCount: coinCells.length,
      trapCount: trapCells.length,
      skillCount: skills.length,
      hasNoCooldownSkill,
      minRouds: Number.isFinite(minRouds) ? minRouds : null,
      coinConsumption: Number.isFinite(coinConsumption) ? coinConsumption : null
    }
  };
}
