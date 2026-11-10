/** Placeholder balance numbers. The ONLY place gameplay constants live; src/data can replace these later. */
export interface EnemyTuning {
  hp: number; speed: number; radius: number; mass: number;
  /** fraction of orb velocity lost on a damaging hit */
  orbSlow: number;
  xp: number;
}

export const TUNING = {
  // ship
  shipSpeed: 320,
  shipAccel: 1800,
  shipRadius: 14,
  hearts: 5,
  iframes: 1.0,
  // tether / orb
  tetherLength: 140,
  stiffness: 40,
  damping: 3,
  maxStretch: 1.6, // hard max length = tetherLength * maxStretch
  reelRatio: 0.5,
  reelTime: 0.25,
  releaseTime: 0.35,
  orbRadius: 16,
  orbMass: 1,
  orbDrag: 0.25,
  maxOrbSpeed: 1600,
  // damage
  minDamageSpeed: 250,
  damagePerSpeed: 0.08,
  critSpeed: 900,
  critMultiplier: 2,
  hitCooldown: 0.15,
  knockback: 0.5,
  knockDrag: 6,
  levelDamageBonus: 0.05,
  // pickups
  pickupRadius: 90,
  moteMaxSpeed: 700,
  moteLife: 40,
  xpBase: 5,
  xpPerLevel: 4,
  // arena
  arenaRadius: 1600,
  wallSoft: 140,
  wallPush: 3200,
  // death
  deathLockout: 0.4,
  // enemies
  mite: { hp: 20, speed: 110, radius: 12, mass: 1, orbSlow: 0.04, xp: 1 } as EnemyTuning,
  dart: { hp: 14, speed: 80, radius: 11, mass: 0.8, orbSlow: 0.03, xp: 2 } as EnemyTuning,
  brute: { hp: 120, speed: 55, radius: 26, mass: 4, orbSlow: 0.18, xp: 6 } as EnemyTuning,
  dartTriggerRange: 380,
  dartTelegraph: 0.7,
  dartLockBefore: 0.15, // aim freezes this long before the dash
  dartDashSpeed: 760,
  dartDashTime: 0.45,
  dartRecover: 0.7,
  // spawner
  spawn: {
    minDistance: 820, // just beyond the screen half-diagonal (~734)
    maxDistance: 1000,
    baseTarget: 8,
    perSecond: 0.35,
    cap: 400,
    rate: 6, // spawns per second while below target
    dartFrom: 20,
    bruteFrom: 45,
  },
  // juice (render / game loop only)
  fx: {
    hitstopCritMs: 40,
    hitstopHitMs: 16,
    hitstopMinGapMs: 220,
    shakeHit: 0.1,
    shakeCrit: 0.35,
    shakeHurt: 0.6,
  },
};
export type Tuning = typeof TUNING;
