// Data validation. Returns a list of human-readable errors; empty list = valid.
// Run at boot in dev builds and in CI (data.test.ts).
import {
  AD_POLICY, BASE_STATS, BEHAVIOR_PARAMS, BOSS_TIMES_SEC, COSMETICS, DIRECTOR, ENEMIES, ENTITLEMENTS, EVENTS,
  META_UNLOCKS, ORBS, PHYSICS, PICKUPS, PROGRESSION, RUN_LENGTH_SEC, SHIPS, SKUS, STAT_LIMITS, UPGRADES, WAVES,
} from './index';
import type { BehaviorRef, CosmeticSlot, StatKey, StatMod } from './types';

export const FIXED_IDS = {
  enemies: ['mite', 'dart', 'wisp', 'blob', 'blobling', 'spitter', 'brute'],
  bosses: ['warden', 'hive', 'eclipse'],
  pickups: ['xpSmall', 'xpBig', 'heart', 'magnet', 'stardust'],
  shipSkin: ['default', 'neon', 'ember', 'void', 'gold'],
  orbSkin: ['default', 'plasma', 'ice', 'molten', 'prism'],
  trail: ['none', 'spark', 'ribbon', 'pixel', 'rainbow'],
  behaviors: [
    'chainOnCrit', 'tetherDamage', 'shockwaveOnReel', 'orbExplodeOnCrit', 'thorns', 'vampiric', 'magnetPulse', 'slowField',
  ],
  supporterItems: ['gold', 'prism', 'rainbow'],
} as const;

const MIN_TELEGRAPH_SEC = 0.6;

export function validateData(): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const statKeys = new Set(Object.keys(BASE_STATS));

  const uniq = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${label}: duplicate id '${id}'`);
      seen.add(id);
    }
    return seen;
  };
  const finitePos = (label: string, v: number, allowZero = false) => {
    if (!Number.isFinite(v) || v < 0 || (!allowZero && v === 0)) err(`${label}: expected ${allowZero ? '>= 0' : '> 0'}, got ${v}`);
  };
  const checkMods = (label: string, mods: readonly StatMod[]) => {
    for (const m of mods) {
      if (!statKeys.has(m.stat)) err(`${label}: unknown stat '${m.stat}'`);
      if (!Number.isFinite(m.value)) err(`${label}: non-finite mod value for ${m.stat}`);
      if (m.op === 'mul' && m.value <= 0) err(`${label}: mul mod on ${m.stat} must be > 0`);
    }
  };
  const checkBehavior = (label: string, b: BehaviorRef | undefined) => {
    if (!b) return;
    const required = BEHAVIOR_PARAMS[b.id];
    if (!required) { err(`${label}: unknown behavior '${b.id}'`); return; }
    for (const p of required) {
      if (!(p in b.params)) err(`${label}: behavior ${b.id} missing param '${p}'`);
    }
    for (const [k, v] of Object.entries(b.params)) {
      if (!required.includes(k)) err(`${label}: behavior ${b.id} has unknown param '${k}'`);
      finitePos(`${label}.${k}`, v, true);
    }
  };

  // ---- stats & physics ----
  for (const k of Object.keys(STAT_LIMITS) as StatKey[]) {
    const { min, max } = STAT_LIMITS[k];
    if (!(min < max)) err(`STAT_LIMITS.${k}: min must be < max`);
    if (BASE_STATS[k] < min || BASE_STATS[k] > max) err(`BASE_STATS.${k}=${BASE_STATS[k]} outside limits [${min}, ${max}]`);
  }
  for (const [k, v] of Object.entries(PHYSICS)) finitePos(`PHYSICS.${k}`, v);
  if (PHYSICS.wallSpeedLoss >= 1) err('PHYSICS.wallSpeedLoss must be < 1');
  if (PHYSICS.enemyHitSpeedLoss >= 1) err('PHYSICS.enemyHitSpeedLoss must be < 1');

  // ---- enemies ----
  const enemyIds = uniq('ENEMIES', ENEMIES.map((e) => e.id));
  const mobIds = new Set(ENEMIES.filter((e) => e.ai !== 'boss').map((e) => e.id));
  const bossIds = new Set(ENEMIES.filter((e) => e.ai === 'boss').map((e) => e.id));
  for (const id of FIXED_IDS.enemies) if (!mobIds.has(id)) err(`ENEMIES: missing fixed enemy '${id}'`);
  for (const id of FIXED_IDS.bosses) if (!bossIds.has(id)) err(`ENEMIES: missing fixed boss '${id}'`);
  for (const e of ENEMIES) {
    const l = `enemy ${e.id}`;
    for (const k of ['hp', 'speed', 'radius', 'mass'] as const) finitePos(`${l}.${k}`, e[k]);
    finitePos(`${l}.contactDamage`, e.contactDamage, true);
    finitePos(`${l}.xp`, e.xp, true);
    if (e.stardustChance < 0 || e.stardustChance > 1) err(`${l}: stardustChance must be in [0, 1]`);
    if (e.splitInto !== undefined) {
      if (!mobIds.has(e.splitInto)) err(`${l}: splitInto '${e.splitInto}' is not a regular enemy`);
      if (e.splitInto === e.id) err(`${l}: cannot split into itself`);
      if (!e.splitCount || e.splitCount < 1) err(`${l}: splitInto needs splitCount >= 1`);
    }
    if (e.summon !== undefined && !mobIds.has(e.summon)) err(`${l}: summon '${e.summon}' is not a regular enemy`);
    for (const [k, v] of Object.entries(e.params)) {
      finitePos(`${l}.params.${k}`, v, true);
      if (/TelegraphSec$|^telegraphSec$/.test(k) && v < MIN_TELEGRAPH_SEC) err(`${l}.params.${k}=${v} is below the ${MIN_TELEGRAPH_SEC} s telegraph floor`);
    }
  }

  // ---- waves ----
  const sorted = [...WAVES].sort((a, b) => a.fromSec - b.fromSec);
  if (sorted.length === 0) err('WAVES: empty');
  let cursor = 0;
  for (const w of sorted) {
    const l = `wave ${w.fromSec}-${w.toSec}`;
    if (w.fromSec !== cursor) err(`${l}: gap or overlap, expected fromSec ${cursor}`);
    if (!(w.toSec > w.fromSec)) err(`${l}: toSec must be > fromSec`);
    cursor = w.toSec;
    finitePos(`${l}.spawnPerSec`, w.spawnPerSec);
    finitePos(`${l}.maxAlive`, w.maxAlive);
    finitePos(`${l}.hpMul`, w.hpMul);
    if (w.maxAlive > DIRECTOR.hardEnemyCap) err(`${l}: maxAlive exceeds DIRECTOR.hardEnemyCap`);
    if (w.mix.length === 0) err(`${l}: empty mix`);
    for (const m of w.mix) {
      if (!mobIds.has(m.enemy)) err(`${l}: mix enemy '${m.enemy}' is not a regular enemy`);
      if (!(m.weight > 0)) err(`${l}: weight for ${m.enemy} must be > 0`);
    }
  }
  if (cursor !== RUN_LENGTH_SEC) err(`WAVES: must end at ${RUN_LENGTH_SEC}, ends at ${cursor}`);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].hpMul < sorted[i - 1].hpMul) err(`WAVES: hpMul must never decrease (at ${sorted[i].fromSec} s)`);
  }

  // ---- events ----
  for (const ev of EVENTS) {
    const l = `event ${ev.type}@${ev.atSec}`;
    if (!enemyIds.has(ev.enemy)) err(`${l}: unknown enemy '${ev.enemy}'`);
    if (ev.atSec < 0 || ev.atSec >= RUN_LENGTH_SEC) err(`${l}: atSec outside [0, ${RUN_LENGTH_SEC})`);
    if (!(ev.count >= 1)) err(`${l}: count must be >= 1`);
    if (ev.type === 'boss' && !bossIds.has(ev.enemy)) err(`${l}: boss event must reference a boss`);
    if (ev.type !== 'boss' && bossIds.has(ev.enemy)) err(`${l}: only boss events may spawn bosses`);
  }
  for (const [boss, t] of Object.entries(BOSS_TIMES_SEC)) {
    const evs = EVENTS.filter((e) => e.type === 'boss' && e.enemy === boss);
    if (evs.length !== 1) err(`EVENTS: expected exactly one boss event for ${boss}, found ${evs.length}`);
    else if (evs[0].atSec !== t) err(`EVENTS: ${boss} at ${evs[0].atSec} s but BOSS_TIMES_SEC says ${t}`);
  }

  // ---- behaviors ----
  const behaviorKeys = Object.keys(BEHAVIOR_PARAMS).sort();
  if (behaviorKeys.join() !== [...FIXED_IDS.behaviors].sort().join()) err(`BEHAVIOR_PARAMS keys must be exactly the 8 fixed behaviors`);

  // ---- upgrades & meta unlocks ----
  const metaIds = uniq('META_UNLOCKS', META_UNLOCKS.map((m) => m.id));
  const upgradeIds = uniq('UPGRADES', UPGRADES.map((u) => u.id));
  const usedBehaviors = new Set<string>();
  for (const u of UPGRADES) {
    const l = `upgrade ${u.id}`;
    if (!(u.maxStacks >= 1 && Number.isInteger(u.maxStacks))) err(`${l}: maxStacks must be an integer >= 1`);
    if (u.mods.length === 0 && !u.behavior) err(`${l}: does nothing (no mods, no behavior)`);
    if (u.behavior && u.maxStacks !== 1) err(`${l}: behavior upgrades must have maxStacks 1`);
    checkMods(l, u.mods);
    checkBehavior(l, u.behavior);
    if (u.behavior) usedBehaviors.add(u.behavior.id);
    if (u.unlock !== 'default' && !metaIds.has(u.unlock)) err(`${l}: unlock '${u.unlock}' is not a META_UNLOCKS id`);
    if (!PROGRESSION.rarityWeights[u.rarity]) err(`${l}: rarity '${u.rarity}' has no weight`);
  }
  for (const b of FIXED_IDS.behaviors) if (!usedBehaviors.has(b)) err(`UPGRADES: behavior '${b}' is not used by any upgrade`);
  for (const m of META_UNLOCKS) {
    finitePos(`meta ${m.id}.cost`, m.cost);
    if (m.unlocks.length === 0) err(`meta ${m.id}: unlocks nothing`);
    for (const id of m.unlocks) {
      if (!upgradeIds.has(id)) err(`meta ${m.id}: unknown upgrade '${id}'`);
      else if (UPGRADES.find((u) => u.id === id)!.unlock !== m.id) err(`meta ${m.id}: upgrade '${id}' has a different unlock field`);
    }
  }
  for (const u of UPGRADES) {
    if (u.unlock !== 'default' && !META_UNLOCKS.some((m) => m.id === u.unlock && m.unlocks.includes(u.id))) {
      err(`upgrade ${u.id}: not listed in META_UNLOCKS '${u.unlock}'.unlocks`);
    }
  }
  const defaultPool = UPGRADES.filter((u) => u.unlock === 'default');
  if (defaultPool.length < PROGRESSION.upgradeChoices * 3) err('UPGRADES: default pool too small for a varied first run');

  // ---- ships & orbs ----
  for (const [label, list] of [['SHIPS', SHIPS], ['ORBS', ORBS]] as const) {
    uniq(label, list.map((x) => x.id));
    if (list.length === 0 || list[0].unlockCost !== 0) err(`${label}: first entry must be free (unlockCost 0)`);
    list.forEach((x, i) => {
      if (i > 0 && !(x.unlockCost > 0)) err(`${label} ${x.id}: only the first entry may be free`);
      checkMods(`${label} ${x.id}`, x.mods);
    });
  }
  for (const o of ORBS) checkBehavior(`orb ${o.id}`, o.behavior);

  // ---- cosmetics & SKUs ----
  const skuIds = uniq('SKUS', SKUS.map((s) => s.sku));
  uniq('COSMETICS (slot:id)', COSMETICS.map((c) => `${c.slot}:${c.id}`));
  for (const slot of ['shipSkin', 'orbSkin', 'trail'] as CosmeticSlot[]) {
    const ids = new Set(COSMETICS.filter((c) => c.slot === slot).map((c) => c.id));
    for (const id of FIXED_IDS[slot]) if (!ids.has(id)) err(`COSMETICS: missing ${slot} '${id}'`);
  }
  for (const c of COSMETICS) {
    const l = `cosmetic ${c.slot}:${c.id}`;
    const isDefault = c.id === 'default' || c.id === 'none';
    const isSupporter = (FIXED_IDS.supporterItems as readonly string[]).includes(c.id);
    if ('free' in c.price) { if (!isDefault) err(`${l}: only defaults may be free`); }
    else if (isDefault) err(`${l}: defaults must be { free: true }`);
    if ('sku' in c.price) {
      if (!skuIds.has(c.price.sku)) err(`${l}: unknown sku '${c.price.sku}'`);
      if (!isSupporter) err(`${l}: only supporter items are sku-priced`);
    } else if (isSupporter) err(`${l}: supporter items must be priced { sku: 'supporter_pack' }`);
    if ('stardust' in c.price) finitePos(`${l}.price.stardust`, c.price.stardust);
  }
  const entitlements = new Set<string>(ENTITLEMENTS);
  for (const s of SKUS) {
    finitePos(`sku ${s.sku}.priceEurCents`, s.priceEurCents);
    if (!Number.isInteger(s.priceEurCents)) err(`sku ${s.sku}: priceEurCents must be an integer`);
    for (const g of s.grants) {
      const matches = COSMETICS.filter((c) => c.id === g);
      if (entitlements.has(g)) continue;
      if (matches.length === 0) err(`sku ${s.sku}: grant '${g}' is neither a cosmetic nor an entitlement`);
      if (matches.length > 1) err(`sku ${s.sku}: grant '${g}' is ambiguous across slots`);
    }
  }
  const supporter = SKUS.find((s) => s.sku === 'supporter_pack');
  if (!supporter) err('SKUS: missing supporter_pack');
  else for (const g of [...FIXED_IDS.supporterItems, 'noAds', 'supporter']) {
    if (!supporter.grants.includes(g)) err(`supporter_pack must grant '${g}'`);
  }

  // ---- progression & pickups ----
  const xp = PROGRESSION.xpForLevel;
  if (xp.length === 0) err('PROGRESSION.xpForLevel: empty');
  xp.forEach((v, i) => {
    finitePos(`xpForLevel[${i}]`, v);
    if (i > 0 && !(v > xp[i - 1])) err(`xpForLevel must be strictly increasing (index ${i}: ${xp[i - 1]} -> ${v})`);
  });
  for (const [r, w] of Object.entries(PROGRESSION.rarityWeights)) if (!(w > 0)) err(`rarityWeights.${r} must be > 0`);
  if (!(PROGRESSION.upgradeChoices >= 1)) err('upgradeChoices must be >= 1');
  finitePos('rerollsPerRun', PROGRESSION.rerollsPerRun, true);
  for (const [k, v] of Object.entries(PROGRESSION.stardust)) finitePos(`stardust.${k}`, v);
  const pickupIds = uniq('PICKUPS', PICKUPS.map((p) => p.id));
  for (const id of FIXED_IDS.pickups) if (!pickupIds.has(id)) err(`PICKUPS: missing '${id}'`);
  for (const p of PICKUPS) if (p.dropChance < 0 || p.dropChance > 1) err(`pickup ${p.id}: dropChance must be in [0, 1]`);

  // ---- ads ----
  for (const [k, v] of Object.entries(AD_POLICY)) finitePos(`AD_POLICY.${k}`, v);
  if (AD_POLICY.interstitialEveryRuns < 3) err('AD_POLICY: interstitials at most once every 3 runs');
  if (AD_POLICY.interstitialMinGapSec < 180) err('AD_POLICY: interstitials at least 180 s apart');

  return errors;
}
