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

// 全局链式最优求解：状态 = (第几个 BOSS, 当前 BOSS 剩余血量, 冷却向量)，
// 每使用一个技能算作一回合，用按回合分层的 BFS 找到"打完全部 BOSS 的最少【总】回合数"。
//
// 为什么不能像以前那样逐个 BOSS 各自取最少回合再拼起来：技能冷却会在 BOSS 之间继承，
// 而同一个 BOSS 达到相同最少回合往往有多条技能序列，它们留给下一个 BOSS 的冷却状态不同。
// 只顾把当前 BOSS 打到最少回合，可能把大招留在很长的冷却里，反而拖累后续 BOSS，
// 导致【总】回合数不是最优（boss_case_3/4 就是这样被以前的贪心做法坑了）。
// 这里把整条链一起搜索，才是真正的全局最优。
function solveBossChainOptimal(bossHps, skills, cap = 400) {
  if (!bossHps.length) return { success: true, totalTurns: 0, path: [] };
  const n = skills.length;

  // 起点：跳过进入时血量已 <=0 的 BOSS（正常用例不会出现，稳妥起见处理一下）。
  let startBoss = 0;
  while (startBoss < bossHps.length && bossHps[startBoss] <= 0) startBoss += 1;
  if (startBoss >= bossHps.length) return { success: true, totalTurns: 0, path: [] };

  const startCd = Array(n).fill(0);
  const keyOf = (bi, hp, cd) => `${bi}|${Math.max(0, hp)}|${cd.join(',')}`;
  let frontier = [{ bi: startBoss, hp: bossHps[startBoss], cd: startCd, path: [] }];
  const seen = new Set([keyOf(startBoss, bossHps[startBoss], startCd)]);

  for (let turns = 1; turns <= cap && frontier.length; turns += 1) {
    const next = [];
    for (const state of frontier) {
      for (let i = 0; i < n; i += 1) {
        if (state.cd[i] !== 0) continue;
        const cd = state.cd.map((value) => Math.max(0, value - 1));
        cd[i] = skills[i].cooldown;
        let hp = state.hp - skills[i].damage;
        let bi = state.bi;
        const path = [...state.path, { boss: bi, skillIndex: i }];
        if (hp <= 0) {
          bi += 1;
          while (bi < bossHps.length && bossHps[bi] <= 0) bi += 1;
          if (bi >= bossHps.length) return { success: true, totalTurns: turns, path };
          hp = bossHps[bi];
        }
        const stateKey = keyOf(bi, hp, cd);
        if (seen.has(stateKey)) continue;
        seen.add(stateKey);
        next.push({ bi, hp, cd, path });
      }
    }
    frontier = next;
  }
  return { success: false };
}

// 把全局最优路径按 BOSS 拆分，并回放冷却，得到每个 BOSS 的技能序列、回合数与结束冷却。
function decomposeChain(path, bossHps, skills) {
  const n = skills.length;
  const perBoss = bossHps.map((hp) => ({ hp, bestSequence: [], minTurns: 0, finalCooldowns: Array(n).fill(0) }));
  let cd = Array(n).fill(0);
  for (const step of path) {
    cd = cd.map((value) => Math.max(0, value - 1));
    cd[step.skillIndex] = skills[step.skillIndex].cooldown;
    const boss = perBoss[step.boss];
    boss.bestSequence.push(skills[step.skillIndex].id);
    boss.minTurns += 1;
    boss.finalCooldowns = [...cd];
  }
  return perBoss;
}

export function solveBossGroup(input = {}) {
  const bosses = Array.isArray(input.B) ? input.B.map(Number) : [];
  const rawSkills = input.PlayerSkills ?? undefined;
  const skills = normalizeSkills(rawSkills);
  const hasNoCooldownSkill = skills.some((skill) => skill.cooldown === 0);

  const perBossWarning = hasNoCooldownSkill ? null : '未提供无冷却技能，技能进入冷却后可能无法持续输出';
  const wrap = (perBoss) => perBoss.map((boss, index) => ({
    bossIndex: index,
    hp: boss.hp,
    minTurns: boss.minTurns,
    bestSequence: boss.bestSequence,
    finalCooldowns: boss.finalCooldowns,
    hasNoCooldownSkill,
    warning: boss.minTurns == null ? perBossWarning : null,
    skills
  }));

  let results;
  // 只要存在无冷却技能，任何有限血量的 BOSS 都必然可解（大不了一直用该技能），
  // 全局 BFS 一定能在上限内找到解，用它拿到全局最优总回合数。
  const chain = skills.length && hasNoCooldownSkill ? solveBossChainOptimal(bosses, skills) : { success: false };
  if (chain.success) {
    results = wrap(decomposeChain(chain.path, bosses, skills));
  } else {
    // 兜底：无无冷却技能或全局搜索失败时，退回逐个 BOSS 贪心（可给出 null 表示无解），
    // 保持对不可解用例的既有行为与告警。
    const greedy = [];
    let cooldowns;
    for (let index = 0; index < bosses.length; index += 1) {
      const solved = solveSingleBoss(bosses[index], rawSkills, cooldowns);
      greedy.push({ bossIndex: index, ...solved });
      if (solved.minTurns != null) cooldowns = solved.finalCooldowns;
    }
    results = greedy;
  }

  const minTurns = results.reduce((sum, boss) => sum + (boss.minTurns ?? 0), 0);
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
