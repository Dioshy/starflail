// Single entry point for all STARFLAIL game data. Tune numbers in the files below, never in game code.
import { BOSSES, MOBS } from './enemies';
import type { EnemyDef } from './types';

export * from './types';
export { BASE_STATS, STAT_LIMITS, PHYSICS, INPUT_DEFAULTS } from './stats';
export { MOBS, BOSSES } from './enemies';
export { WAVES, EVENTS, DIRECTOR } from './waves';
export { UPGRADES, BEHAVIOR_PARAMS } from './upgrades';
export { SHIPS, ORBS } from './loadout';
export { COSMETICS, SKUS, ENTITLEMENTS, AD_POLICY } from './shop';
export { PROGRESSION, PICKUPS, META_UNLOCKS } from './progression';
export * from './formulas';

/** All enemy definitions, regular enemies first, then bosses (ai: 'boss'). */
export const ENEMIES: EnemyDef[] = [...MOBS, ...BOSSES];

export const RUN_LENGTH_SEC = 600;
export const ARENA_RADIUS = 1600;
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
/** Boss spawn times, mirrored from EVENTS for UI (timeline pips). validate.ts checks they agree. */
export const BOSS_TIMES_SEC = { warden: 180, hive: 360, eclipse: 540 } as const;
export const DATA_VERSION = 1;
