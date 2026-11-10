export type EnemyKind = 'mite' | 'dart' | 'brute';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; // self-propelled velocity
  kx: number; ky: number; // knockback velocity
  hp: number; maxHp: number; radius: number; mass: number;
  state: number; timer: number; dirX: number; dirY: number;
  hitCd: number;
  flash: number; // cosmetic only, not hashed
  alive: boolean;
}

export interface Mote {
  x: number; y: number; px: number; py: number; vx: number; vy: number; value: number; age: number; alive: boolean;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; nx: number; ny: number; dmg: number; crit: boolean; speed: number; kind: EnemyKind }
  | { type: 'crit'; x: number; y: number; dmg: number }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind }
  | { type: 'playerHurt'; x: number; y: number; hearts: number }
  | { type: 'pickup'; x: number; y: number }
  | { type: 'levelUp'; level: number }
  | { type: 'death'; x: number; y: number };
