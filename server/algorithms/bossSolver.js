function cooldownKey(cooldowns) {
  return cooldowns.join(',');
}

function optimisticTurns(hp, skills) {
  const maxDamage = Math.max(...skills.map((skill) => skill.damage));
  return Math.ceil(Math.max(0, hp) / Math.max(1, maxDamage));
}

export function normalizeSkills(rawSkills = [[8, 4], [2, 0], [4, 2], [6, 3]]) {
  return rawSkills.map((skill, index) => ({
    id: `skill-${index + 1}`,
    name: `技能${index + 1}`,
    damage: Number(skill[0]),
    cooldown: Number(skill[1])
  })).filter((skill) => Number.isFinite(skill.damage) && skill.damage > 0 && Number.isFinite(skill.cooldown) && skill.cooldown >= 0);
}

// 求解单个 BOSS 的最少回合与技能序列。initialCooldowns 用于承接前一个 BOSS
// 战斗结束时的冷却状态——同一组 B[] 内进入每个 BOSS 的技能集合相同，但冷却
// 会在 BOSS 之间继承，而非每场重置为 0（课程 Q&A 明确要求）。
export function solveSingleBoss(hp, rawSkills, initialCooldowns) {
  const skills = normalizeSkills(rawSkills);
  const startCooldowns = Array.isArray(initialCooldowns) && initialCooldowns.length === skills.length
    ? [...initialCooldowns]
    : Array(skills.length).fill(0);
  const initial = {
    turn: 0,
    hp: Number(hp),
    cooldowns: startCooldowns,
    sequence: []
  };
  let best = null;
  const queue = [initial];
  const seen = new Map();

  while (queue.length) {
    queue.sort((a, b) => (a.turn + optimisticTurns(a.hp, skills)) - (b.turn + optimisticTurns(b.hp, skills)));
    const state = queue.shift();
    if (state.hp <= 0) {
      best = state;
      break;
    }
    if (best && state.turn >= best.turn) continue;
    if (state.turn + optimisticTurns(state.hp, skills) > 80) continue;
    const stateKey = `${Math.max(0, state.hp)}|${cooldownKey(state.cooldowns)}`;
    if ((seen.get(stateKey) ?? Infinity) <= state.turn) continue;
    seen.set(stateKey, state.turn);

    const available = skills
      .map((skill, index) => ({ skill, index }))
      .filter(({ index }) => state.cooldowns[index] === 0)
      .sort((a, b) => b.skill.damage - a.skill.damage);

    for (const { skill, index } of available) {
      const cooldowns = state.cooldowns.map((value) => Math.max(0, value - 1));
      cooldowns[index] = skill.cooldown;
      queue.push({
        turn: state.turn + 1,
        hp: state.hp - skill.damage,
        cooldowns,
        sequence: [...state.sequence, skill.id]
      });
    }
  }

  const hasNoCooldownSkill = skills.some((skill) => skill.cooldown === 0);
  return {
    hp: Number(hp),
    minTurns: best?.turn ?? null,
    bestSequence: best?.sequence ?? [],
    finalCooldowns: best?.cooldowns ?? startCooldowns,
    hasNoCooldownSkill,
    warning: hasNoCooldownSkill ? null : '未提供无冷却技能，技能进入冷却后可能无法持续输出',
    skills
  };
}

export function solveBossGroup(input = {}) {
  const bosses = Array.isArray(input.B) ? input.B.map(Number) : [];
  const skills = input.PlayerSkills ?? undefined;
  const results = [];
  let cooldowns;
  for (let index = 0; index < bosses.length; index += 1) {
    const solved = solveSingleBoss(bosses[index], skills, cooldowns);
    results.push({ bossIndex: index, ...solved });
    // 只有在此 BOSS 被击败（有解）时才推进冷却状态；若无解则保留上一状态，
    // 避免污染后续 BOSS 的求解起点。
    if (solved.minTurns != null) cooldowns = solved.finalCooldowns;
  }
  const minTurns = results.reduce((sum, boss) => sum + (boss.minTurns ?? 0), 0);
  const hasNoCooldownSkill = normalizeSkills(skills).some((skill) => skill.cooldown === 0);
  return {
    bossCount: bosses.length,
    minTurns,
    bestSequence: results.flatMap((boss) => boss.bestSequence.map((skill) => `B${boss.bossIndex + 1}:${skill}`)),
    turnLimit: Number(input.minRouds ?? input.minRounds ?? 20),
    reviveCost: Number(input.CoinConsumption ?? 5),
    hasNoCooldownSkill,
    warning: hasNoCooldownSkill ? null : '技能集合缺少无冷却技能，可能无法在限定回合内稳定击败 BOSS',
    bosses: results
  };
}

// 完整 BOSS 战推演：依次挑战每个 BOSS，每个 BOSS 在每条命里有 turnLimit 个回合，
// 若最优击败回合数超出限额则视为失败，消耗金币复活后继续；金币不足以支付复活
// 且 BOSS 未被击败时触发 GAME OVER。直接对应"金币耗尽且失败即 GAME OVER"需求。
export function simulateBossBattle(input = {}) {
  const group = solveBossGroup(input);
  const { turnLimit, reviveCost } = group;
  const startCoins = Number(input.coins ?? input.startCoins ?? 50);
  let coins = startCoins;
  let totalRounds = 0;
  let revives = 0;
  let bossesDefeated = 0;
  let gameOver = false;
  const log = [];

  for (const boss of group.bosses) {
    if (gameOver) break;
    const need = boss.minTurns;
    if (need == null) {
      log.push({ bossIndex: boss.bossIndex, hp: boss.hp, event: 'unbeatable', reason: '当前技能无法击败该 BOSS' });
      gameOver = true;
      break;
    }
    const livesNeeded = Math.max(1, Math.ceil(need / turnLimit));
    let usedRounds = 0;
    let defeated = false;
    for (let life = 1; life <= livesNeeded; life += 1) {
      const roundsThisLife = Math.min(turnLimit, need - usedRounds);
      usedRounds += roundsThisLife;
      totalRounds += roundsThisLife;
      const lastLife = life === livesNeeded;
      if (lastLife) {
        defeated = true;
        bossesDefeated += 1;
        log.push({
          bossIndex: boss.bossIndex,
          hp: boss.hp,
          event: 'defeated',
          minTurns: need,
          roundsThisLife,
          bestSequence: boss.bestSequence,
          coinsLeft: coins
        });
      } else if (coins >= reviveCost) {
        coins -= reviveCost;
        revives += 1;
        log.push({
          bossIndex: boss.bossIndex,
          hp: boss.hp,
          event: 'revive',
          roundsThisLife,
          cost: reviveCost,
          coinsLeft: coins
        });
      } else {
        log.push({
          bossIndex: boss.bossIndex,
          hp: boss.hp,
          event: 'game-over',
          roundsThisLife,
          coinsLeft: coins,
          reason: '金币耗尽且 BOSS 未被击败'
        });
        gameOver = true;
        break;
      }
    }
    if (!defeated) break;
  }

  return {
    cleared: !gameOver,
    gameOver,
    bossCount: group.bossCount,
    bossesDefeated,
    turnLimit,
    reviveCost,
    startCoins,
    remainingCoins: coins,
    totalRounds,
    revives,
    warning: group.warning,
    log
  };
}
