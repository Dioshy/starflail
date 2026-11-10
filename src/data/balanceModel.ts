// Deterministic paper model behind design/mechanics/balance.md. Every assumption is a named constant.
// XP pacing (M1) is MEASURED from the headless competent bot; the rest is MODELLED until playtest telemetry.
// data.test.ts asserts the targets.
import { BASE_STATS, BOSSES, ENEMIES, EVENTS, RUN_LENGTH_SEC, STAT_LIMITS, WAVES } from './index';
import { hitDamage, runStardust, xpToNext } from './formulas';
import type { EnemyDef, WaveDef } from './types';

export const ASSUMPTIONS = {
  /** A1 (old): a median player kills about as fast as the director spawns. DISPROVEN by the headless bot
   *  (it kills ~10-20% of spawns). Kept only for the stardust model (balance.md §5), which still uses it. */
  killRateOfSpawn: 1,
  /** A2: share of dropped stardust/XP actually collected (stardust model only). */
  xpCollection: 0.85,
  /** A3: seconds a median run-3+ player needs to kill each boss (balance.md section 2). */
  bossKillSec: { warden: 41, hive: 55, eclipse: 54 } as Record<string, number>,
  /** A4: share of stardust pickups collected. */
  stardustCollection: 0.8,
} as const;

/**
 * M1: MEASURED pacing of the competent headless bot (src/game/bot.ts, seeds 1-10, first run, no unlocks),
 * with the xpForLevel curve and enemy XP of 2026-11-10. One row per minute of run time, pooled over the runs
 * still alive. `killsPerSec` counts every kill (split children included); `xpPerKill` is XP actually
 * collected per kill (after xpGain, mote losses and the enemy mix; bosses were never killed).
 * Re-measure with `PACING_PROBE=1 npx vitest run src/data/pacingProbe.test.ts` whenever enemy XP, waves or
 * the bot change. The bot's rate depends on its level, so the curve and this table are fitted together.
 */
export const MEASURED_PACING: { fromSec: number; killsPerSec: number; xpPerKill: number }[] = [
  { fromSec: 0, killsPerSec: 0.41, xpPerKill: 0.79 },
  { fromSec: 60, killsPerSec: 0.54, xpPerKill: 1.54 },
  { fromSec: 120, killsPerSec: 0.37, xpPerKill: 1.36 },
  { fromSec: 180, killsPerSec: 0.13, xpPerKill: 3.45 },
  { fromSec: 240, killsPerSec: 0.25, xpPerKill: 1.54 },
  { fromSec: 300, killsPerSec: 0.21, xpPerKill: 2.28 },
  { fromSec: 360, killsPerSec: 0.16, xpPerKill: 2.86 },
  { fromSec: 420, killsPerSec: 0.34, xpPerKill: 1.34 },
  { fromSec: 480, killsPerSec: 0.19, xpPerKill: 2.66 },
  { fromSec: 540, killsPerSec: 0.34, xpPerKill: 2.17 },
];

/** Whole-run averages from the same measurement (balance.md §4). */
export const MEASURED_RUN = { killsPerSec: 0.29, xpPerKill: 1.73, xpPerSec: 0.51 } as const;

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

/** Expected collected XP per second at time t for a competent player (M1: measured kill rate x XP per kill). */
export function xpRateAt(t: number, xpGain = 1): number {
  let row = MEASURED_PACING[0];
  for (const r of MEASURED_PACING) if (t >= r.fromSec) row = r;
  return row.killsPerSec * row.xpPerKill * xpGain;
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

/**
 * Times (s) at which a competent player reaches level 2, 3, ... within `untilSec` (M1).
 * `withBossKills` adds the Warden/Hive XP lumps at A3 (a player who kills bosses; the bot never did).
 */
export function levelUpTimes(untilSec = RUN_LENGTH_SEC, xpGain = 1, withBossKills = false): number[] {
  const lumps = withBossKills ? xpLumps().filter((l, i) => EVENTS[i].type === 'boss') : [];
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

/** Gaps between consecutive level-ups (s). */
export function levelUpGaps(times: number[]): number[] {
  return times.slice(1).map((t, i) => t - times[i]);
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

/** P1-P3 in balance.md §8: Gear's greybox measurements and what they imply. */
export const PASSIVE_SWING = {
  /** measured pulsed-reel DPS in Gear's harness (orbDrag 1.25, circle rate 1) */
  pulsedDps: 790,
  /** average damage of a pulsed-reel hit (mostly crits at ~1000 px/s, base stats) */
  pulsedHitDamage: 160,
  /** inferred p50 orb speed at contact when never reeling, at orbDrag 1.25 */
  passiveSpeedP50: 220,
  targetRatio: { min: 0.15, max: 0.25 },
  maxHitsToKillMite: 2,
} as const;

/** Passive speed after changing orbDrag, first-order (steady swing ∝ 1 / drag). An estimate, not a sim. */
export function passiveSpeedAtDrag(orbDrag: number, measuredAt = 1.25, speed = PASSIVE_SWING.passiveSpeedP50): number {
  return speed * (measuredAt / orbDrag);
}

/** Checks the passive-swing floor for a never-reeling player against the first-minute mite. */
export function passiveSwingFloor(minDamageSpeed: number, passiveSpeed: number) {
  const stats = { ...BASE_STATS, minDamageSpeed };
  const hit = hitDamage(passiveSpeed, stats).damage;
  const mite = ENEMIES.find((e) => e.id === 'mite')!;
  const miteHp = mite.hp * WAVES[0].hpMul;
  const hitsToKillMite = hit > 0 ? Math.ceil(miteHp / hit) : Infinity;
  const ratio = hit / PASSIVE_SWING.pulsedHitDamage;
  const ok =
    hitsToKillMite <= PASSIVE_SWING.maxHitsToKillMite &&
    ratio >= PASSIVE_SWING.targetRatio.min && ratio <= PASSIVE_SWING.targetRatio.max;
  return { hit, hitsToKillMite, ratio, ok };
}
