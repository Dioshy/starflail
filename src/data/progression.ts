import type { MetaUnlockDef, PickupDef, ProgressionDef } from './types';

// Rule cards: xp.md, upgrade-draft.md, stardust.md, meta-unlocks.md. Derivations: balance.md.

export const PROGRESSION: ProgressionDef = {
  // XP to go from level (i+1) to (i+2). Fitted so a median run levels every ~20-35 s (balance.md section 4).
  xpForLevel: [
    10, 18, 28, 40, 54, 70, 85, 100, 115, 130,
    145, 160, 175, 190, 205, 220, 235, 250, 265, 280,
    295, 310, 325, 340, 355, 370, 385, 400, 415, 430,
  ],
  xpOverflowStep: 15,
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
