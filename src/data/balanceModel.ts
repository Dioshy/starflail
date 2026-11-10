// Deterministic paper model behind design/mechanics/balance.md. Every assumption is a named constant.
// These are MODELLED numbers, to be replaced by playtest telemetry. data.test.ts asserts the targets.
import { BOSSES, ENEMIES, EVENTS, PROGRESSION, RUN_LENGTH_SEC, STAT_LIMITS, WAVES } from './index';
import { runStardust, xpToNext } from './formulas';
import type { EnemyDef, WaveDef } from './types';

export const ASSUMPTIONS = {
  /** A1: a median player kills about as fast as the director spawns (steady state). */
  killRateOfSpawn: 1,
  /** A2: share of dropped XP actually collected. */
  xpCollection: 0.85,
  /** A3: seconds a median run-3+ player needs to kill each boss (balance.md section 2). */
  bossKillSec: { warden: 41, hive: 55, eclipse: 54 } as Record<string, number>,
  /** A4: share of stardust pickups collected. */
  stardustCollection: 0.8,
} as const;

const byId = new Map<string, EnemyDef>(ENEMIES.map((e) => [e.id, e]));

/** XP from one kill of `id`, including its split children. */
export function xpPerKill(id: string): number {
  const e = byId.get(id)!;
  const child = e.splitInto ? xpPerKill(e.splitInto) * (e.splitCount ?? 0) : 0;
  return e.xp + child;
}

export function stardustChancePerKill(id: string): number {
  const e = byId.get(id)!;
  const child = e.splitInto ? stardustChancePerKill(e.splitInto) * (e.splitCount ?? 0) : 0;
  return e.stardustChance + child;
}

function mixAvg(w: WaveDef, f: (id: string) => number): number {
  const total = w.mix.reduce((s, m) => s + m.weight, 0);
  return w.mix.reduce((s, m) => s + f(m.enemy) * m.weight, 0) / total;
}

export function waveAt(t: number): WaveDef {
  return WAVES.find((w) => t >= w.fromSec && t < w.toSec) ?? WAVES[WAVES.length - 1];
}

/** Expected XP per second at time t from wave spawns (A1, A2). */
export function xpRateAt(t: number, xpGain = 1): number {
  const w = waveAt(t);
  const waveXp = w.spawnPerSec * ASSUMPTIONS.killRateOfSpawn * mixAvg(w, xpPerKill);
  return (waveXp + summonXpRateAt(t)) * ASSUMPTIONS.xpCollection * xpGain;
}

/** XP/s from boss summons (hive broods) while that boss is alive, phase 1 rate (conservative). */
export function summonXpRateAt(t: number): number {
  let rate = 0;
  for (const ev of EVENTS) {
    if (ev.type !== 'boss') continue;
    const boss = byId.get(ev.enemy)!;
    const fight = ASSUMPTIONS.bossKillSec[ev.enemy] ?? 0;
    if (!boss.summon || t < ev.atSec || t >= ev.atSec + fight) continue;
    const p = boss.params;
    rate += ((p.broodCount ?? 0) / (p.broodIntervalSec ?? Infinity)) * xpPerKill(boss.summon);
  }
  return rate;
}

/** One-off XP lumps: event spawns at their time, bosses when killed (A3). */
export function xpLumps(): { t: number; xp: number }[] {
  return EVENTS.map((ev) => {
    if (ev.type === 'boss') {
      return { t: ev.atSec + (ASSUMPTIONS.bossKillSec[ev.enemy] ?? 0), xp: xpPerKill(ev.enemy) * ASSUMPTIONS.xpCollection };
    }
    return { t: ev.atSec + 5, xp: xpPerKill(ev.enemy) * ev.count * ASSUMPTIONS.xpCollection };
  });
}

/** Times (s) at which a median player reaches level 2, 3, ... within `untilSec`. */
export function levelUpTimes(untilSec = RUN_LENGTH_SEC, xpGain = 1): number[] {
  const lumps = xpLumps();
  const times: number[] = [];
  let level = 1;
  let xp = 0;
  const dt = 0.5;
  for (let t = 0; t < untilSec; t += dt) {
    xp += xpRateAt(t, xpGain) * dt;
    for (const l of lumps) if (l.t >= t && l.t < t + dt) xp += l.xp * xpGain;
    while (xp >= xpToNext(level)) {
      xp -= xpToNext(level);
      level += 1;
      times.push(t + dt);
    }
  }
  return times;
}

/** Expected stardust pickups dropped up to time t (A1, A4). */
export function stardustPickupsUntil(untilSec: number): number {
  let n = 0;
  for (let t = 0; t < untilSec; t += 1) {
    const w = waveAt(t);
    n += w.spawnPerSec * mixAvg(w, stardustChancePerKill);
  }
  for (const ev of EVENTS) if (ev.atSec < untilSec) n += stardustChancePerKill(ev.enemy) * ev.count;
  return n * ASSUMPTIONS.stardustCollection;
}

export interface ArchetypeRun { run: number; diesAtSec: number; bossKills: number; won: boolean }

/** A5: median-player skill curve over their first 20 runs (balance.md section 5). */
export const MEDIAN_PLAYER_RUNS: ArchetypeRun[] = [
  { run: 1, diesAtSec: 290, bossKills: 0, won: false },
  { run: 2, diesAtSec: 330, bossKills: 1, won: false },
  { run: 3, diesAtSec: 360, bossKills: 1, won: false },
  { run: 4, diesAtSec: 420, bossKills: 1, won: false },
  { run: 5, diesAtSec: 450, bossKills: 2, won: false },
  { run: 6, diesAtSec: 500, bossKills: 2, won: false },
  { run: 7, diesAtSec: 560, bossKills: 2, won: false },
  { run: 8, diesAtSec: 590, bossKills: 3, won: true },
  ...Array.from({ length: 12 }, (_, i): ArchetypeRun =>
    i % 2 === 0
      ? { run: 9 + i, diesAtSec: 590, bossKills: 3, won: true }
      : { run: 9 + i, diesAtSec: 520, bossKills: 2, won: false }),
];

export function stardustForRun(r: ArchetypeRun): number {
  return runStardust({
    secondsSurvived: r.diesAtSec,
    bossKills: r.bossKills,
    won: r.won,
    stardustPickups: Math.round(stardustPickupsUntil(r.diesAtSec)),
    stardustGain: 1,
  });
}

export function cumulativeStardust(runs = MEDIAN_PLAYER_RUNS): number[] {
  let sum = 0;
  return runs.map((r) => (sum += stardustForRun(r)));
}

/** Worst-case single-hit damage with every damage stat at its STAT_LIMITS max. Finite by construction. */
export function worstCaseHit(): number {
  const L = STAT_LIMITS;
  return 1600 * L.damagePerSpeed.max * Math.pow(L.orbMass.max, 0.5) * L.critMultiplier.max;
}

export function bossHp(id: string): number {
  return BOSSES.find((b) => b.id === id)!.hp;
}
