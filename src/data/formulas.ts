// Pure helpers that turn data into numbers. Gear's sim should call these instead of re-deriving formulas.
import { BASE_STATS, PHYSICS, STAT_LIMITS } from './stats';
import { PROGRESSION } from './progression';
import type { StatKey, StatMod, Stats } from './types';

const STAT_KEYS = Object.keys(BASE_STATS) as StatKey[];

export function clampStat(stat: StatKey, value: number): number {
  const { min, max } = STAT_LIMITS[stat];
  return Math.min(max, Math.max(min, value));
}

/** final = (base + sum(add)) * (1 + sum(mul - 1)), clamped to STAT_LIMITS. orbCount is floored. */
export function computeStats(mods: readonly StatMod[], base: Stats = BASE_STATS): Stats {
  const out = {} as Stats;
  for (const key of STAT_KEYS) {
    let add = 0;
    let mulSum = 0;
    for (const m of mods) {
      if (m.stat !== key) continue;
      if (m.op === 'add') add += m.value;
      else mulSum += m.value - 1;
    }
    let v = (base[key] + add) * (1 + mulSum);
    if (key === 'orbCount' || key === 'shipMaxHp') v = Math.floor(v);
    out[key] = clampStat(key, v);
  }
  return out;
}

export interface HitResult {
  damage: number;
  crit: boolean;
  /** true when speed < minDamageSpeed: a bump with knockback only */
  bump: boolean;
}

/**
 * Damage for one orb hit (damage-and-crit.md).
 * speed is clamped to PHYSICS.maxOrbSpeed. armor applies the brute's low-speed penalty.
 */
export function hitDamage(
  speed: number,
  s: Pick<Stats, 'damagePerSpeed' | 'minDamageSpeed' | 'critSpeed' | 'critMultiplier' | 'orbMass'>,
  armor?: { armorSpeed: number; armorDamageMul: number },
): HitResult {
  const v = Math.min(Math.max(0, speed), PHYSICS.maxOrbSpeed);
  if (v < s.minDamageSpeed) return { damage: 0, crit: false, bump: true };
  const crit = v >= s.critSpeed;
  let dmg = v * s.damagePerSpeed * Math.pow(s.orbMass, PHYSICS.massDamageExponent);
  if (crit) dmg *= s.critMultiplier;
  if (armor && v < armor.armorSpeed) dmg *= armor.armorDamageMul;
  return { damage: Math.round(dmg), crit, bump: false };
}

/** XP needed to go from `level` to `level + 1` (level starts at 1). */
export function xpToNext(level: number): number {
  const t = PROGRESSION.xpForLevel;
  const i = Math.max(0, Math.floor(level) - 1);
  if (i < t.length) return t[i];
  return t[t.length - 1] + (i - t.length + 1) * (PROGRESSION.xpOverflowStep ?? 15);
}

/** Split an enemy's xp into motes: as many xpBig (5) as fit, rest xpSmall (1). */
export function xpMotes(xp: number): { xpBig: number; xpSmall: number } {
  const big = Math.floor(xp / 5);
  return { xpBig: big, xpSmall: xp - big * 5 };
}

/** Speed of a tangentially moving orb after the rest length changes r0 -> r1 (angular momentum). */
export function reelSpeed(tangentialSpeed: number, r0: number, r1: number): number {
  if (r1 <= 0) return Math.min(tangentialSpeed, PHYSICS.maxOrbSpeed);
  return Math.min(tangentialSpeed * (r0 / r1), PHYSICS.maxOrbSpeed);
}

export interface RunSummary {
  secondsSurvived: number;
  bossKills: number;
  won: boolean;
  stardustPickups: number;
  stardustGain: number;
}

/** Stardust banked at the results screen, before the optional doubleStardust ad (stardust.md). */
export function runStardust(r: RunSummary): number {
  const p = PROGRESSION.stardust;
  const raw =
    (Math.max(0, r.secondsSurvived) / 60) * p.perMinuteSurvived + // prorated per second
    r.bossKills * p.perBossKill +
    (r.won ? p.winBonus : 0) +
    r.stardustPickups * p.perPickup;
  return Math.floor(raw * clampStat('stardustGain', r.stardustGain));
}
