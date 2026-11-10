import type { MetaUnlockDef, PickupDef, ProgressionDef } from './types';

// Rule cards: xp.md, upgrade-draft.md, stardust.md, meta-unlocks.md. Derivations: balance.md.

export const PROGRESSION: ProgressionDef = {
  // XP to go from level (i+1) to (i+2). Fitted to the MEASURED competent-bot XP rate (0.83 XP/s at 1-2 min,
  // ~0.47 XP/s at 3-9 min) so level-ups land every ~20-40 s (balance.md section 4, M1).
  xpForLevel: [
    5, 9, 12, 14, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
    32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  ],
  xpOverflowStep: 2,
  upgradeChoices: 3,
  rerollsPerRun: 1,
  rarityWeights: { common: 65, rare: 28, epic: 7 },
  stardust: { perMinuteSurvived: 10, perBossKill: 50, winBonus: 150, perPickup: 5 },
  fallbackReward: { heal: 1, stardust: 10 },
};

export const PICKUPS: PickupDef[] = [
  { id: 'xpSmall', name: 'XP Mote', value: 1, dropChance: 0, radius: 6, lifetimeSec: 0 },
  { id: 'xpBig', name: 'Big XP Mote', value: 5, dropChance: 0, radius: 10, lifetimeSec: 0 },
  { id: 'heart', name: 'Heart', value: 1, dropChance: 0.005, radius: 12, lifetimeSec: 20 },
  { id: 'magnet', name: 'Magnet', value: 1, dropChance: 0.002, radius: 12, lifetimeSec: 20 },
  { id: 'stardust', name: 'Stardust', value: 1, dropChance: 0, radius: 10, lifetimeSec: 30 },
];

/** Stardust purchases that add upgrades to the draft pool (options, not power). */
export const META_UNLOCKS: MetaUnlockDef[] = [
  { id: 'reelArsenal', name: 'Reel Arsenal', cost: 200,
    description: 'Adds Reel Shock and Gravity Reel to the draft.', unlocks: ['reelShock', 'gravityReel'] },
  { id: 'stormKit', name: 'Storm Kit', cost: 300,
    description: 'Adds Nova Core and Static Hull to the draft.', unlocks: ['novaCore', 'staticHull'] },
  { id: 'survivorKit', name: 'Survivor Kit', cost: 450,
    description: 'Adds Leech Orb and Tractor Pulse to the draft.', unlocks: ['leechOrb', 'tractorPulse'] },
];
