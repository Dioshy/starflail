import type { AnyEnemyId, BehaviorId, EnemyDef, PickupId } from '../data';

export type EnemyKind = AnyEnemyId;
export type ReelPhase = 'idle' | 'reeling' | 'held' | 'releasing';

/** state: 0 = idle/moving, 1 = telegraph, 2 = attack. Mapped to the art's EnemyState by the renderer. */
export interface Enemy {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; // self-propelled velocity
  kx: number; ky: number; // knockback velocity
  ang: number; // heading (render + steering)
  hp: number; maxHp: number; radius: number; mass: number;
  state: number; pat: number; timer: number; telTotal: number;
  dirX: number; dirY: number; // locked aim
  tx: number; ty: number; // locked target point (blink)
  cd0: number; cd1: number; cd2: number; // pattern / ability cooldowns
  hitCd0: number; hitCd1: number; hitCd2: number; // per (orb, enemy) pair cooldown
  tetherCd: number; thornsCd: number;
  invuln: number; stun: number; roar: number; flash: number;
  phase2: boolean;
  aux: number; aux2: number; acc: number; // misc AI scratch (orbit dir, shot accumulator, ...)
  age: number;
  summoner: number; // id of the boss that summoned it, 0 = none
  alive: boolean;
}

export interface Pickup {
  kind: PickupId;
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  value: number; age: number; homing: boolean; alive: boolean;
}

export interface Projectile {
  kind: 'spit' | 'bossBolt';
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  r: number; dmg: number; life: number; alive: boolean;
}

export interface OrbState {
  x: number; y: number; px: number; py: number; vx: number; vy: number; radius: number; wallCd: number;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; nx: number; ny: number; dmg: number; crit: boolean; bump: boolean; secondary: boolean; speed: number; kind: EnemyKind; boss: boolean }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind; boss: boolean }
  | { type: 'playerHurt'; x: number; y: number; hp: number; dmg: number; source: string }
  | { type: 'heal'; x: number; y: number; amount: number }
  | { type: 'pickup'; x: number; y: number; kind: PickupId }
  | { type: 'levelUp'; level: number }
  | { type: 'draftOpen' }
  | { type: 'upgradePicked'; id: string }
  | { type: 'reelStart'; speed: number }
  | { type: 'reelEnd' }
  | { type: 'bossWarn'; boss: EnemyKind }
  | { type: 'bossSpawn'; boss: EnemyKind; x: number; y: number }
  | { type: 'bossDie'; boss: EnemyKind; x: number; y: number }
  | { type: 'bossLeft'; boss: EnemyKind }
  | { type: 'bossPhase'; boss: EnemyKind }
  | { type: 'bossStun'; x: number; y: number }
  | { type: 'shockwave'; x: number; y: number; r: number }
  | { type: 'explosion'; x: number; y: number; r: number }
  | { type: 'chain'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'thorns'; x: number; y: number }
  | { type: 'swat'; x: number; y: number }
  | { type: 'orbWall'; x: number; y: number; speed: number }
  | { type: 'behavior'; id: BehaviorId }
  | { type: 'victory' }
  | { type: 'death'; x: number; y: number };

export interface DraftCard {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
  /** current stacks held (for pips) and max */
  stacks: number;
  maxStacks: number;
  /** true for the Field Repair fallback */
  fallback?: boolean;
}

export interface DraftState {
  cards: DraftCard[];
  rerollsLeft: number;
  canReroll: boolean;
}
