import type { EnemyDef } from './types';

// Rule cards: design/mechanics/enemies.md and bosses.md
// Units: hp, px/s, px, ship HP, mass (knockback divisor), xp, chance 0..1, seconds.
// Every telegraph is >= 0.6 s (pillar 2: readable chaos).

export const MOBS: EnemyDef[] = [
  {
    id: 'mite', name: 'Mite', ai: 'chaser',
    hp: 20, speed: 110, radius: 12, contactDamage: 1, mass: 1, xp: 1, stardustChance: 0.01,
    tell: 'Swarms straight at you. One clean hit pops it.',
    params: { turnRate: 4 },
  },
  {
    id: 'dart', name: 'Dart', ai: 'dasher',
    hp: 30, speed: 90, radius: 12, contactDamage: 1, mass: 1, xp: 3, stardustChance: 0.02,
    tell: 'Glows, then dashes in a straight line. Step sideways.',
    params: { triggerRange: 190, telegraphSec: 0.7, dashSpeed: 600, dashSec: 0.35, cooldownSec: 3 },
  },
  {
    id: 'wisp', name: 'Wisp', ai: 'orbiter',
    hp: 25, speed: 140, radius: 10, contactDamage: 1, mass: 0.8, xp: 3, stardustChance: 0.02,
    tell: 'Circles out of reach, then lunges. Swing through its orbit.',
    params: {
      orbitRadius: 260, orbitAngularSpeed: 0.55, telegraphSec: 0.6, lungeSpeed: 520, lungeSec: 0.55,
      cooldownSec: 3.5, firstLungeDelaySec: 2,
    },
  },
  {
    id: 'blob', name: 'Blob', ai: 'splitter',
    hp: 60, speed: 70, radius: 22, contactDamage: 1, mass: 3, xp: 5, stardustChance: 0.03,
    splitInto: 'blobling', splitCount: 2,
    tell: 'Splits in two when popped.',
    params: { splitSpreadPx: 26, splitImpulse: 220, splitInvulnSec: 0.2 },
  },
  {
    id: 'blobling', name: 'Blobling', ai: 'chaser',
    hp: 15, speed: 130, radius: 10, contactDamage: 1, mass: 0.6, xp: 1, stardustChance: 0,
    tell: 'Small, fast, fragile.',
    params: { turnRate: 5 },
  },
  {
    id: 'spitter', name: 'Spitter', ai: 'shooter',
    hp: 35, speed: 100, radius: 14, contactDamage: 1, mass: 1.2, xp: 5, stardustChance: 0.04,
    tell: 'Keeps its distance and spits. Your orb swats spit out of the air.',
    params: {
      keepDistance: 380, distanceTolerance: 60, telegraphSec: 0.6, fireIntervalSec: 2.5,
      projectileSpeed: 260, projectileDamage: 1, projectileRadius: 8, projectileLifeSec: 4,
    },
  },
  {
    id: 'brute', name: 'Brute', ai: 'tank',
    hp: 220, speed: 55, radius: 30, contactDamage: 2, mass: 6, xp: 14, stardustChance: 0.15,
    tell: 'Armoured: slow hits clang off. Reel for speed. Winds up before charging.',
    params: {
      knockbackResist: 0.7, armorSpeed: 450, armorDamageMul: 0.25,
      chargeRange: 360, chargeTelegraphSec: 0.9, chargeSpeed: 300, chargeSec: 0.8, chargeCooldownSec: 5,
    },
  },
];

export const BOSSES: EnemyDef[] = [
  {
    id: 'warden', name: 'The Warden', ai: 'boss',
    hp: 4000, speed: 80, radius: 56, contactDamage: 2, mass: 40, xp: 45, stardustChance: 1,
    tell: 'Bait its charge into the wall, then punish.',
    params: {
      knockbackResist: 0.95,
      ringTelegraphSec: 0.8, ringCount: 16, ringSpeed: 220, ringIntervalSec: 5, projectileDamage: 1,
      chargeTelegraphSec: 1.0, chargeSpeed: 650, chargeSec: 0.7, chargeIntervalSec: 7,
      wallStunSec: 2, stunnedDamageMul: 1.5,
      phase2HpPct: 0.5, phase2RingCount: 24, phase2IntervalMul: 0.75, phase2RingRotateDeg: 7.5,
    },
  },
  {
    id: 'hive', name: 'The Hive', ai: 'boss',
    hp: 7500, speed: 40, radius: 72, contactDamage: 2, mass: 60, xp: 90, stardustChance: 1,
    summon: 'blobling',
    tell: 'Spawns broods and fires fans. Kill the brood with momentum, then dive.',
    params: {
      knockbackResist: 0.95,
      broodTelegraphSec: 0.8, broodIntervalSec: 6, broodCount: 6, maxSummonsAlive: 18,
      volleyTelegraphSec: 0.7, volleyCount: 5, volleySpreadDeg: 50, volleySpeed: 300, volleyIntervalSec: 4,
      projectileDamage: 1,
      phase2HpPct: 0.5, phase2BroodCount: 9, phase2IntervalMul: 0.7,
    },
  },
  {
    id: 'eclipse', name: 'Eclipse', ai: 'boss',
    hp: 13000, speed: 70, radius: 80, contactDamage: 2, mass: 80, xp: 0, stardustChance: 1,
    tell: 'Spiral arms, blinks, and in phase 2 a gravity well that also whips your orb faster.',
    params: {
      knockbackResist: 0.97,
      spiralTelegraphSec: 0.8, spiralArms: 3, spiralDurationSec: 3, spiralShotsPerSecPerArm: 6,
      spiralSpeed: 240, spiralTurnDegPerSec: 60, spiralIntervalSec: 8, projectileDamage: 1,
      blinkTelegraphSec: 0.9, blinkRadius: 140, blinkDamage: 2, blinkIntervalSec: 6, blinkMinDistance: 250,
      wellTelegraphSec: 1.0, wellDurationSec: 4, wellOrbPull: 400, wellShipPull: 120, wellRadius: 700,
      wellIntervalSec: 10,
      phase2HpPct: 0.5, phase2IntervalMul: 0.75,
    },
  },
];
