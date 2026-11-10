import type { OrbDef, ShipDef } from './types';

// Rule card: design/mechanics/meta-unlocks.md
// Pillar 3: every non-free ship/orb is a sidegrade. Each gains something and pays for it.

export const SHIPS: ShipDef[] = [
  { id: 'comet', name: 'Comet', unlockCost: 0,
    description: 'Balanced hull. Learn the swing here.',
    mods: [] },
  { id: 'sparrow', name: 'Sparrow', unlockCost: 350,
    description: 'Fast and twitchy: +20% speed, +40% accel, +0.2 s i-frames, but 2 less HP. Play: kite wide and let the orb trail.',
    mods: [
      { stat: 'shipSpeed', op: 'mul', value: 1.2 },
      { stat: 'shipAccel', op: 'mul', value: 1.4 },
      { stat: 'iframesSec', op: 'add', value: 0.2 },
      { stat: 'shipMaxHp', op: 'add', value: -2 },
    ] },
  { id: 'lasso', name: 'Lasso', unlockCost: 550,
    description: '+40% tether and 10% tighter reel, but a looser line and 5% slower ship. Play: huge reel spikes, timing-heavy.',
    mods: [
      { stat: 'tetherLength', op: 'mul', value: 1.4 },
      { stat: 'reelRatio', op: 'add', value: -0.1 },
      { stat: 'tetherStiffness', op: 'mul', value: 0.8 },
      { stat: 'shipSpeed', op: 'mul', value: 0.95 },
    ] },
  { id: 'bulwark', name: 'Bulwark', unlockCost: 800,
    description: '+3 HP, but 15% slower, 15% less accel, 20% smaller pickup radius. Play: stand your ground and spin with the reel.',
    mods: [
      { stat: 'shipMaxHp', op: 'add', value: 3 },
      { stat: 'shipSpeed', op: 'mul', value: 0.85 },
      { stat: 'shipAccel', op: 'mul', value: 0.85 },
      { stat: 'pickupRadius', op: 'mul', value: 0.8 },
    ] },
];

export const ORBS: OrbDef[] = [
  { id: 'iron', name: 'Iron', unlockCost: 0,
    description: 'The honest weight.',
    mods: [] },
  { id: 'feather', name: 'Feather', unlockCost: 250,
    description: '40% lighter and smaller, but crits 150 px/s sooner for +0.5 crit multiplier. Play: always-crit glass cannon.',
    mods: [
      { stat: 'orbMass', op: 'mul', value: 0.6 },
      { stat: 'orbRadius', op: 'add', value: -4 },
      { stat: 'critSpeed', op: 'add', value: -150 },
      { stat: 'critMultiplier', op: 'add', value: 0.5 },
    ] },
  { id: 'twin', name: 'Twin', unlockCost: 450,
    description: 'Two light orbs on nested tethers (second at 80% length). Play: area coverage, weak against armour.',
    mods: [
      { stat: 'orbCount', op: 'add', value: 1 },
      { stat: 'orbMass', op: 'mul', value: 0.6 },
      { stat: 'orbRadius', op: 'add', value: -3 },
      { stat: 'tetherLength', op: 'mul', value: 0.9 },
    ] },
  { id: 'anvil', name: 'Anvil', unlockCost: 700,
    description: '80% heavier, bigger, +40% knockback, but crits need 100 px/s more and it drags your ship 8%. Play: slow wind-up, huge hits.',
    mods: [
      { stat: 'orbMass', op: 'mul', value: 1.8 },
      { stat: 'orbRadius', op: 'add', value: 8 },
      { stat: 'knockback', op: 'mul', value: 1.4 },
      { stat: 'critSpeed', op: 'add', value: 100 },
      { stat: 'shipSpeed', op: 'mul', value: 0.92 },
    ] },
];
