import type { PhysicsDef, StatKey, Stats } from './types';

// Rule cards: tether-and-orb.md, reel.md, damage-and-crit.md, health.md
export const BASE_STATS: Stats = {
  shipMaxHp: 5,
  shipSpeed: 320, // px/s
  shipAccel: 1800, // px/s^2
  orbMass: 1,
  orbRadius: 18, // px
  tetherLength: 140, // px, rest length
  tetherStiffness: 40, // spring k: orb accel = k * stretch / orbMass (px/s^2 per px)
  reelRatio: 0.5, // reeled length = reelRatio * tetherLength (lower = stronger reel)
  damagePerSpeed: 0.08, // damage per px/s of orb speed
  minDamageSpeed: 250, // px/s; below this a hit only bumps
  critSpeed: 900, // px/s; at or above this a hit crits
  critMultiplier: 2,
  knockback: 1,
  pickupRadius: 90, // px
  xpGain: 1,
  iframesSec: 1.0,
  regenPerMin: 0,
  orbCount: 1,
  stardustGain: 1,
};

/** Every final stat is clamped to [min, max]. No stat is uncapped (balance.md, "no uncapped multiplication"). */
export const STAT_LIMITS: Record<StatKey, { min: number; max: number }> = {
  shipMaxHp: { min: 1, max: 12 },
  shipSpeed: { min: 200, max: 480 },
  shipAccel: { min: 900, max: 3600 },
  orbMass: { min: 0.4, max: 3 },
  orbRadius: { min: 10, max: 40 },
  tetherLength: { min: 90, max: 280 },
  tetherStiffness: { min: 20, max: 80 },
  reelRatio: { min: 0.3, max: 0.8 },
  damagePerSpeed: { min: 0.04, max: 0.2 },
  minDamageSpeed: { min: 120, max: 400 },
  critSpeed: { min: 550, max: 1300 },
  critMultiplier: { min: 1.5, max: 4 },
  knockback: { min: 0.5, max: 3 },
  pickupRadius: { min: 60, max: 320 },
  xpGain: { min: 0.5, max: 2 },
  iframesSec: { min: 0.5, max: 2 },
  regenPerMin: { min: 0, max: 3 },
  orbCount: { min: 1, max: 3 },
  stardustGain: { min: 1, max: 1.5 },
};

export const PHYSICS: PhysicsDef = {
  maxOrbSpeed: 1600, // px/s hard clamp
  hitCooldownSec: 0.15, // per (orb, enemy) pair
  reelTimeSec: 0.25, // rest length lerps L -> reelRatio*L
  heldReelExtraDamping: 1.5, // 1/s, applied after the reel completes while still held
  wallSpeedLoss: 0.5, // fraction of orb speed lost on arena-wall contact
  reelReleaseSec: 0.35, // rest length lerps back to L
  orbLinearDrag: 0.15, // 1/s, always on
  tetherDamping: 4, // 1/s, damps radial (stretch) velocity only
  maxStretchRatio: 1.6, // tether behaves as a hard rope beyond 1.6 * rest length
  massDamageExponent: 0.5, // damage scales with orbMass^0.5
  shipMass: 2, // tether reaction force on the ship = F / shipMass
  enemyHitSpeedLoss: 0.08, // orb keeps 92% speed per damaging hit
  knockbackBase: 0.35, // enemy dv = orbSpeed * knockbackBase * knockback * orbMass / enemyMass * (1 - resist)
  knockbackDecayPerSec: 6, // enemy knockback velocity *= exp(-6 * dt)
  projectileHardCap: 300, // oldest enemy projectile is removed beyond this
  fixedStepHz: 60,
};
