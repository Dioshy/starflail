import { describe, expect, it } from 'vitest';
import {
  BASE_STATS, BOSSES, COSMETICS, ENEMIES, EVENTS, META_UNLOCKS, ORBS, PROGRESSION, SHIPS, STAT_LIMITS, UPGRADES,
  computeStats, eligibleUpgrades, hitDamage, reelSpeed, rollDraft, runStardust, xpMotes, xpToNext,
} from './index';
import type { StatKey, StatMod } from './index';
import { validateData } from './validate';
import {
  MEDIAN_PLAYER_RUNS, PASSIVE_SWING, cumulativeStardust, levelUpGaps, levelUpTimes, MEASURED_PACING, MEASURED_RUN, passiveSpeedAtDrag, passiveSwingFloor, worstCaseHit,
} from './balanceModel';

/** Seeded PRNG (mulberry32) so draft tests are reproducible. */
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('data integrity', () => {
  it('validateData() reports no errors', () => {
    expect(validateData()).toEqual([]);
  });
  it('has the content volume the brief asks for', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(18);
    expect(UPGRADES.filter((u) => u.behavior).length).toBeGreaterThanOrEqual(8);
    expect(UPGRADES.filter((u) => u.tags?.some((t) => t === 'reel' || t === 'tether')).length).toBeGreaterThanOrEqual(6);
    expect(SHIPS).toHaveLength(4);
    expect(ORBS).toHaveLength(4);
  });
});

describe('stat formula', () => {
  it('no mods gives base stats', () => {
    expect(computeStats([])).toEqual(BASE_STATS);
  });
  it('final = (base + adds) * (1 + sum(mul - 1))', () => {
    const mods: StatMod[] = [
      { stat: 'tetherLength', op: 'add', value: 20 },
      { stat: 'tetherLength', op: 'mul', value: 1.4 },
      { stat: 'tetherLength', op: 'mul', value: 0.9 },
    ];
    expect(computeStats(mods).tetherLength).toBeCloseTo((140 + 20) * (1 + 0.4 - 0.1));
  });
  it('clamps to STAT_LIMITS', () => {
    const mods: StatMod[] = Array.from({ length: 10 }, () => ({ stat: 'reelRatio', op: 'add', value: -0.05 }));
    expect(computeStats(mods).reelRatio).toBe(STAT_LIMITS.reelRatio.min);
  });
});

describe('damage and crit', () => {
  const s = computeStats([]);
  it('given speed below minDamageSpeed, then it is a bump with 0 damage', () => {
    expect(hitDamage(149, s)).toEqual({ damage: 0, crit: false, bump: true });
  });
  it('given speed exactly minDamageSpeed, then it deals damage', () => {
    expect(hitDamage(150, s)).toEqual({ damage: 12, crit: false, bump: false });
  });
  it('given speed exactly critSpeed, then it crits', () => {
    expect(hitDamage(900, s)).toEqual({ damage: 144, crit: true, bump: false });
  });
  it('given speed above maxOrbSpeed, then it is clamped to 1600', () => {
    expect(hitDamage(5000, s).damage).toBe(256);
  });
  it('given brute armor and a slow hit, then damage is quartered', () => {
    expect(hitDamage(400, s, { armorSpeed: 450, armorDamageMul: 0.25 }).damage).toBe(8);
    expect(hitDamage(450, s, { armorSpeed: 450, armorDamageMul: 0.25 }).damage).toBe(36);
  });
  it('given a base reel from 140 to 70 px at 450 px/s, then the orb reaches crit speed', () => {
    expect(reelSpeed(450, 140, 70)).toBe(900);
    expect(reelSpeed(1000, 140, 70)).toBe(1600);
  });
  it('worst-case hit is finite and cannot one-shot any boss', () => {
    const worst = worstCaseHit();
    expect(Number.isFinite(worst)).toBe(true);
    for (const b of BOSSES) expect(worst).toBeLessThan(b.hp);
  });
});

describe('xp', () => {
  it('xpToNext follows the table then grows by xpOverflowStep', () => {
    expect(xpToNext(1)).toBe(PROGRESSION.xpForLevel[0]);
    const n = PROGRESSION.xpForLevel.length;
    expect(xpToNext(n)).toBe(PROGRESSION.xpForLevel[n - 1]);
    expect(xpToNext(n + 1)).toBe(PROGRESSION.xpForLevel[n - 1] + PROGRESSION.xpOverflowStep!);
    expect(xpToNext(n + 2)).toBeGreaterThan(xpToNext(n + 1));
  });
  it('splits xp into big and small motes', () => {
    expect(xpMotes(8)).toEqual({ xpBig: 1, xpSmall: 3 });
    expect(xpMotes(0)).toEqual({ xpBig: 0, xpSmall: 0 });
  });
  it('measured-rate model: median level-up gap 20-40 s before Eclipse, first draft by 30 s, no gap over 75 s', () => {
    const t = levelUpTimes().filter((x) => x < 540);
    const gaps = levelUpGaps(t);
    const median = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
    expect(t[0]).toBeLessThanOrEqual(30);
    expect(median).toBeGreaterThanOrEqual(20);
    expect(median).toBeLessThanOrEqual(40);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(75);
    expect(t.length).toBeGreaterThanOrEqual(12);
  });
  it('measured-rate table matches the whole-run average it came from', () => {
    const rate = MEASURED_PACING.reduce((s, r) => s + r.killsPerSec * r.xpPerKill, 0) / MEASURED_PACING.length;
    expect(rate).toBeCloseTo(MEASURED_RUN.xpPerSec, 1);
  });
  it('a boss kill is worth 1-4 drafts at the level a competent player has when it spawns', () => {
    for (const id of ['warden', 'hive']) {
      const ev = EVENTS.find((e) => e.enemy === id)!;
      const level = 1 + levelUpTimes(ev.atSec).length;
      let xp = ENEMIES.find((e) => e.id === id)!.xp, lv = level;
      while (xp >= xpToNext(lv)) { xp -= xpToNext(lv); lv++; }
      expect(lv - level, id).toBeGreaterThanOrEqual(1);
      expect(lv - level, id).toBeLessThanOrEqual(4);
    }
  });
});

describe('upgrade draft', () => {
  const base = { unlockedMeta: new Set<string>(), stacks: {}, currentMods: [], activeBehaviors: new Set<never>() } as const;
  it('given no meta unlocks, then locked upgrades are never eligible', () => {
    const ids = eligibleUpgrades(base).map((u) => u.id);
    for (const u of UPGRADES.filter((x) => x.unlock !== 'default')) expect(ids).not.toContain(u.id);
  });
  it('given an upgrade at maxStacks, then it is not eligible', () => {
    const ids = eligibleUpgrades({ ...base, stacks: { spikedShell: 5 } }).map((u) => u.id);
    expect(ids).not.toContain('spikedShell');
  });
  it('given reelRatio already at its floor, then reel-ratio-only upgrades are not offered', () => {
    const mods: StatMod[] = Array.from({ length: 4 }, () => ({ stat: 'reelRatio', op: 'add', value: -0.05 }));
    const ids = eligibleUpgrades({ ...base, currentMods: mods }).map((u) => u.id);
    expect(ids).not.toContain('tightCoil');
    expect(ids).toContain('whipcrack'); // still changes tether length and crit speed
  });
  it('given the behavior is already active, then the upgrade granting it is not offered', () => {
    const ids = eligibleUpgrades({ ...base, activeBehaviors: new Set(['chainOnCrit'] as const) }).map((u) => u.id);
    expect(ids).not.toContain('arcCoil');
  });
  it('rollDraft returns distinct eligible upgrades and is deterministic per seed', () => {
    const pool = eligibleUpgrades({ ...base, unlockedMeta: new Set(META_UNLOCKS.map((m) => m.id)) });
    for (let seed = 1; seed <= 300; seed++) {
      const a = rollDraft(rngFrom(seed), pool).map((u) => u.id);
      expect(new Set(a).size, `seed ${seed}`).toBe(PROGRESSION.upgradeChoices);
      expect(rollDraft(rngFrom(seed), pool).map((u) => u.id)).toEqual(a);
    }
  });
  it('given fewer eligible than choices, then rollDraft returns what exists (caller adds fallback)', () => {
    expect(rollDraft(rngFrom(1), UPGRADES.slice(0, 2))).toHaveLength(2);
    expect(rollDraft(rngFrom(1), [])).toHaveLength(0);
  });
});

describe('meta progression (pillar 3: options, not power)', () => {
  // +1: higher is better for the player, -1: lower is better, 0: genuine trade-off either way.
  const dir: Record<StatKey, number> = {
    shipMaxHp: 1, shipSpeed: 1, shipAccel: 1, orbMass: 0, orbRadius: 1, tetherLength: 0, tetherStiffness: 0,
    reelRatio: -1, damagePerSpeed: 1, minDamageSpeed: -1, critSpeed: -1, critMultiplier: 1, knockback: 1,
    pickupRadius: 1, xpGain: 1, iframesSec: 1, regenPerMin: 1, orbCount: 0, stardustGain: 1,
  };
  const sign = (m: StatMod) => dir[m.stat] * (m.op === 'add' ? Math.sign(m.value) : Math.sign(m.value - 1));
  it('every non-free ship and orb has a real downside', () => {
    for (const x of [...SHIPS, ...ORBS].filter((d) => d.unlockCost > 0)) {
      expect(x.mods.some((m) => sign(m) < 0), `${x.id} needs a downside`).toBe(true);
    }
  });
  it('first unlock is affordable after about 2 runs, not after 1', () => {
    const cum = cumulativeStardust();
    const prices = [
      ...SHIPS.map((s) => s.unlockCost), ...ORBS.map((o) => o.unlockCost), ...META_UNLOCKS.map((m) => m.cost),
      ...COSMETICS.map((c) => ('stardust' in c.price ? c.price.stardust : 0)),
    ].filter((p) => p > 0);
    const cheapest = Math.min(...prices);
    expect(cum[0]).toBeLessThan(cheapest);
    expect(cum[1]).toBeGreaterThanOrEqual(cheapest);
  });
  it('the whole stardust catalogue is cleared between run 15 and run 20', () => {
    const total =
      SHIPS.reduce((s, x) => s + x.unlockCost, 0) + ORBS.reduce((s, x) => s + x.unlockCost, 0) +
      META_UNLOCKS.reduce((s, x) => s + x.cost, 0) +
      COSMETICS.reduce((s, c) => s + ('stardust' in c.price ? c.price.stardust : 0), 0);
    const cum = cumulativeStardust();
    const run = cum.findIndex((c) => c >= total) + 1;
    expect(run).toBeGreaterThanOrEqual(15);
    expect(run).toBeLessThanOrEqual(20);
  });
  it('median skill curve: first boss by run 2-3, first win by run 5-10, first death at 4-7 min', () => {
    const firstBoss = MEDIAN_PLAYER_RUNS.find((r) => r.bossKills > 0)!.run;
    const firstWin = MEDIAN_PLAYER_RUNS.find((r) => r.won)!.run;
    expect(firstBoss).toBeGreaterThanOrEqual(2);
    expect(firstBoss).toBeLessThanOrEqual(3);
    expect(firstWin).toBeGreaterThanOrEqual(5);
    expect(firstWin).toBeLessThanOrEqual(10);
    expect(MEDIAN_PLAYER_RUNS[0].diesAtSec).toBeGreaterThanOrEqual(240);
    expect(MEDIAN_PLAYER_RUNS[0].diesAtSec).toBeLessThanOrEqual(420);
  });
  it('runStardust prorates time and applies stardustGain within its cap', () => {
    expect(runStardust({ secondsSurvived: 90, bossKills: 0, won: false, stardustPickups: 0, stardustGain: 1 })).toBe(15);
    expect(runStardust({ secondsSurvived: 600, bossKills: 3, won: true, stardustPickups: 10, stardustGain: 9 }))
      .toBe(Math.floor((100 + 150 + 150 + 50) * STAT_LIMITS.stardustGain.max));
  });
});

describe('passive swing floor (balance.md section 8)', () => {
  it('given today\'s tuning (minDamageSpeed 250, orbDrag 1.25), then a never-reeling player fails the floor', () => {
    expect(passiveSwingFloor(250, PASSIVE_SWING.passiveSpeedP50).ok).toBe(false);
  });
  it('given minDamageSpeed 150 alone, then a mite dies in 2 passive hits but DPS is still under 15%', () => {
    const r = passiveSwingFloor(150, PASSIVE_SWING.passiveSpeedP50);
    expect(r.hitsToKillMite).toBe(2);
    expect(r.ratio).toBeLessThan(0.15);
  });
  it('given the recommendation (minDamageSpeed 150 + orbDrag 0.9), then the floor is met', () => {
    const r = passiveSwingFloor(150, passiveSpeedAtDrag(0.9));
    expect(r.ok).toBe(true);
    expect(r.hitsToKillMite).toBeLessThanOrEqual(2);
  });
});
