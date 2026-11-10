// STARFLAIL data schema. Every tunable number lives in src/data/*; code reads, never hard-codes.
// Rule cards that explain each field: design/mechanics/*.md

export type StatKey =
  | 'shipMaxHp'
  | 'shipSpeed'
  | 'shipAccel'
  | 'orbMass'
  | 'orbRadius'
  | 'tetherLength'
  | 'tetherStiffness'
  | 'reelRatio'
  | 'damagePerSpeed'
  | 'minDamageSpeed'
  | 'critSpeed'
  | 'critMultiplier'
  | 'knockback'
  | 'pickupRadius'
  | 'xpGain'
  | 'iframesSec'
  | 'regenPerMin'
  | 'orbCount'
  | 'stardustGain';

export type Stats = Record<StatKey, number>;

/** final = (base + sum(add)) * (1 + sum(mul - 1)), then clamped to STAT_LIMITS. */
export type StatMod = { stat: StatKey; op: 'add' | 'mul'; value: number };

export type BehaviorId =
  | 'chainOnCrit'
  | 'tetherDamage'
  | 'shockwaveOnReel'
  | 'orbExplodeOnCrit'
  | 'thorns'
  | 'vampiric'
  | 'magnetPulse'
  | 'slowField';

export interface BehaviorRef {
  id: BehaviorId;
  params: Record<string, number>;
}

export type EnemyId = 'mite' | 'dart' | 'wisp' | 'blob' | 'blobling' | 'spitter' | 'brute';
export type BossId = 'warden' | 'hive' | 'eclipse';
export type AnyEnemyId = EnemyId | BossId;

export type EnemyAi = 'chaser' | 'dasher' | 'orbiter' | 'splitter' | 'shooter' | 'tank' | 'boss';

export interface EnemyDef {
  id: AnyEnemyId;
  name: string;
  ai: EnemyAi;
  hp: number;
  /** px/s */
  speed: number;
  /** px */
  radius: number;
  /** ship HP removed on touch */
  contactDamage: number;
  /** knockback divisor; also used for enemy-enemy separation */
  mass: number;
  /** total XP dropped on death (split into motes, see xp.md) */
  xp: number;
  /** 0..1 chance to drop one stardust pickup on death */
  stardustChance: number;
  splitInto?: EnemyId;
  splitCount?: number;
  /** enemy id a boss summons (hive) */
  summon?: EnemyId;
  /** short line shown in the codex / first encounter */
  tell?: string;
  params: Record<string, number>;
}

export interface WaveDef {
  fromSec: number;
  toSec: number;
  spawnPerSec: number;
  maxAlive: number;
  hpMul: number;
  mix: { enemy: EnemyId; weight: number }[];
  /** designer note, not read by code */
  note?: string;
}

export interface EventDef {
  atSec: number;
  type: 'boss' | 'swarmRing' | 'rush';
  enemy: AnyEnemyId;
  count: number;
}

export type Rarity = 'common' | 'rare' | 'epic';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  maxStacks: number;
  mods: StatMod[];
  behavior?: BehaviorRef;
  /** 'default' = in the pool from the first run; otherwise a META_UNLOCKS id */
  unlock: 'default' | string;
  /** tags for UI filtering / synergy hints */
  tags?: ('reel' | 'tether' | 'damage' | 'crit' | 'defense' | 'mobility' | 'economy')[];
}

export interface ShipDef {
  id: string;
  name: string;
  description: string;
  mods: StatMod[];
  unlockCost: number;
}

export interface OrbDef {
  id: string;
  name: string;
  description: string;
  mods: StatMod[];
  behavior?: BehaviorRef;
  unlockCost: number;
}

export type CosmeticSlot = 'shipSkin' | 'orbSkin' | 'trail';

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  price: { stardust: number } | { sku: string } | { free: true };
  /** primary colour hint for Hue (hex) */
  color?: string;
}

export interface SkuDef {
  sku: string;
  name: string;
  description: string;
  priceEurCents: number;
  /** cosmetic ids (unique across slots) or ENTITLEMENTS ids */
  grants: string[];
}

export interface ProgressionDef {
  /** xpForLevel[i] = XP needed to go from level i+1 to level i+2. Past the end: last + xpOverflowStep per level. */
  xpForLevel: number[];
  xpOverflowStep?: number;
  upgradeChoices: number;
  rerollsPerRun: number;
  rarityWeights: Record<Rarity, number>;
  stardust: { perMinuteSurvived: number; perBossKill: number; winBonus: number; perPickup: number };
  /** offered when fewer than upgradeChoices upgrades are eligible */
  fallbackReward?: { heal: number; stardust: number };
}

export type PickupId = 'xpSmall' | 'xpBig' | 'heart' | 'magnet' | 'stardust';

export interface PickupDef {
  id: PickupId;
  name: string;
  /** xp for motes, hp for heart, 1 for stardust (worth PROGRESSION.stardust.perPickup) */
  value: number;
  /** chance per non-boss kill; 0 = only dropped by explicit rules */
  dropChance: number;
  radius: number;
  /** seconds before it despawns; 0 = never */
  lifetimeSec: number;
}

export interface MetaUnlockDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** upgrade ids added to the draft pool when bought */
  unlocks: string[];
}

export interface PhysicsDef {
  maxOrbSpeed: number;
  hitCooldownSec: number;
  reelTimeSec: number;
  heldReelExtraDamping: number;
  wallSpeedLoss: number;
  reelReleaseSec: number;
  orbLinearDrag: number;
  tetherDamping: number;
  maxStretchRatio: number;
  massDamageExponent: number;
  shipMass: number;
  enemyHitSpeedLoss: number;
  knockbackBase: number;
  knockbackDecayPerSec: number;
  projectileHardCap: number;
  fixedStepHz: number;
}

export interface DirectorDef {
  spawnDistance: number;
  spawnTries: number;
  ringRadius: number;
  rushSpreadDeg: number;
  rushDurationSec: number;
  hardEnemyCap: number;
  bossWarningSec: number;
  bossLeaveAfterSec: number;
  overtimeHpMulPer30s: number;
  overtimeSpawnMulPer30s: number;
}

export interface AdPolicyDef {
  interstitialEveryRuns: number;
  interstitialMinGapSec: number;
  interstitialGraceRuns: number;
  secondWindHp: number;
  secondWindIframesSec: number;
  secondWindClearRadius: number;
  doubleStardustMul: number;
}
