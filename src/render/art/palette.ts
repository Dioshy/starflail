// STARFLAIL palette. Player = cool cyan/blue family + white. Enemies = warm reds/oranges/magenta,
// lime and violet. Nothing hostile is ever cyan.
export type ShipSkin = 'default' | 'neon' | 'ember' | 'void' | 'gold';
export type OrbSkin = 'default' | 'plasma' | 'ice' | 'molten' | 'prism';
export type TrailId = 'none' | 'spark' | 'ribbon' | 'pixel' | 'rainbow';
export type EnemyId = 'mite' | 'dart' | 'wisp' | 'blob' | 'blobling' | 'spitter' | 'brute';
export type BossId = 'warden' | 'hive' | 'eclipse';
export type EnemyState = 'idle' | 'telegraph' | 'attack';
export type ProjectileKind = 'spit' | 'bossBolt';
export type PickupKind = 'xpSmall' | 'xpBig' | 'heart' | 'magnet' | 'stardust';
export type FloatKind = 'dmg' | 'crit' | 'heal' | 'info';

export const PALETTE = {
  bg0: '#050816', bg1: '#0a1030', bg2: '#111c52', grid: '#2a3d9a', star: '#9fb4ff',
  player: '#35e6ff', playerDeep: '#0a8fb3', white: '#f4fbff',
  text: '#e8f1ff', textDim: '#8fa0cf', danger: '#ff4d5e', warn: '#ffb020', good: '#4dffc4',
  gold: '#ffd166', supporter: '#ffd166',
  enemy: {
    mite: '#ff4d5e', dart: '#ff8a1f', wisp: '#b36bff', blob: '#a6ff2e', blobling: '#c9ff6b',
    spitter: '#ff3fa4', brute: '#ff5a3a',
  } as Record<EnemyId, string>,
  boss: { warden: '#ff7a1a', hive: '#9dff3a', eclipse: '#c07bff' } as Record<BossId, string>,
  projectile: { spit: '#ff3fa4', bossBolt: '#ff5a3a' } as Record<ProjectileKind, string>,
  pickup: { xpSmall: '#4dffc4', xpBig: '#4dffc4', heart: '#ff7a9c', magnet: '#6aa8ff', stardust: '#ffd166' } as Record<PickupKind, string>,
};

export const ENEMY_FILL: Record<string, string> = {
  mite: '#3a0a14', dart: '#3a1a05', wisp: '#1c0b33', blob: '#18300a', blobling: '#1c3a0f',
  spitter: '#3a0a28', brute: '#2a110c', warden: '#331705', hive: '#18300a', eclipse: '#07030f',
};

export function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
