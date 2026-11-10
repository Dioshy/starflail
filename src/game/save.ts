// Persistent save (localStorage key `starflail.save`, version 1). Pure data helpers + a small debounced store.
// Unknown ids/fields are preserved (forward-compatible) but ignored by the game.
import { COSMETICS, INPUT_DEFAULTS, META_UNLOCKS, ORBS, SHIPS, SKUS } from '../data';
import type { CosmeticSlot, ReelMode } from '../data';

export const SAVE_KEY = 'starflail.save';
export const BACKUP_KEY = 'starflail.save.bak';
export const SAVE_VERSION = 1;

export interface Settings {
  master: number; sfx: number; music: number;
  screenShake: boolean;
  reducedFlashes: boolean;
  damageNumbers: boolean;
  controlHints: boolean;
  reelMode: ReelMode;
}

export interface SaveData {
  version: 1;
  stardust: number;
  /** owned ships, orbs and META_UNLOCKS packs (free ones are implicit) */
  unlocks: string[];
  /** owned cosmetics as `slot:id` (free ones are implicit) */
  cosmetics: string[];
  equipped: { ship: string; orb: string; shipSkin: string; orbSkin: string; trail: string };
  /** SKU ids / entitlement ids (empty until the store task) */
  entitlements: string[];
  settings: Settings;
  stats: { runs: number; kills: number; bossKills: number; wins: number; totalTimeSec: number; stardustEarned: number };
  bestTimes: { survivedSec: number; fastestWinSec: number | null };
  hintsDone: { move: boolean; reel: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.9, music: 0.5, screenShake: true, reducedFlashes: false, damageNumbers: true, controlHints: true,
  reelMode: INPUT_DEFAULTS.reelMode,
};

export function defaultSave(): SaveData {
  return {
    version: 1, stardust: 0, unlocks: [], cosmetics: [],
    equipped: { ship: SHIPS[0].id, orb: ORBS[0].id, shipSkin: 'default', orbSkin: 'default', trail: 'none' },
    entitlements: [],
    settings: { ...DEFAULT_SETTINGS },
    stats: { runs: 0, kills: 0, bossKills: 0, wins: 0, totalTimeSec: 0, stardustEarned: 0 },
    bestTimes: { survivedSec: 0, fastestWinSec: null },
    hintsDone: { move: false, reel: false },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);

/**
 * Upgrade any older shape to the current one and sanitise every field. Returns null if `raw` is not a save at all
 * (so the caller can back it up and start fresh).
 *   v0 (no `version`): { stardust, unlocked: string[] } from prototypes -> v1.
 */
export function migrate(raw: unknown): SaveData | null {
  if (!isObj(raw)) return null;
  const ver = raw.version === undefined ? 0 : raw.version;
  if (typeof ver !== 'number' || !Number.isFinite(ver) || ver < 0) return null;
  const d = defaultSave();
  const src: Record<string, unknown> = { ...raw };
  if (ver === 0) {
    // legacy: flat shape; map what we recognise
    if (Array.isArray(src.unlocked) && !src.unlocks) src.unlocks = src.unlocked;
    if (typeof src.bestTime === 'number' && !src.bestTimes) src.bestTimes = { survivedSec: src.bestTime, fastestWinSec: null };
  }
  const eq = isObj(src.equipped) ? src.equipped : {};
  const st = isObj(src.settings) ? src.settings : {};
  const stats = isObj(src.stats) ? src.stats : {};
  const bt = isObj(src.bestTimes) ? src.bestTimes : {};
  const hd = isObj(src.hintsDone) ? src.hintsDone : {};
  const out: SaveData = {
    version: 1,
    stardust: Math.floor(num(src.stardust, 0)),
    unlocks: strs(src.unlocks),
    cosmetics: strs(src.cosmetics),
    equipped: {
      ship: typeof eq.ship === 'string' ? eq.ship : d.equipped.ship,
      orb: typeof eq.orb === 'string' ? eq.orb : d.equipped.orb,
      shipSkin: typeof eq.shipSkin === 'string' ? eq.shipSkin : 'default',
      orbSkin: typeof eq.orbSkin === 'string' ? eq.orbSkin : 'default',
      trail: typeof eq.trail === 'string' ? eq.trail : 'none',
    },
    entitlements: strs(src.entitlements),
    settings: {
      master: num(st.master, d.settings.master, 0, 1), sfx: num(st.sfx, d.settings.sfx, 0, 1), music: num(st.music, d.settings.music, 0, 1),
      screenShake: bool(st.screenShake, true), reducedFlashes: bool(st.reducedFlashes, false), damageNumbers: bool(st.damageNumbers, true),
      controlHints: bool(st.controlHints, true), reelMode: st.reelMode === 'toggle' ? 'toggle' : 'hold',
    },
    stats: {
      runs: Math.floor(num(stats.runs, 0)), kills: Math.floor(num(stats.kills, 0)), bossKills: Math.floor(num(stats.bossKills, 0)),
      wins: Math.floor(num(stats.wins, 0)), totalTimeSec: num(stats.totalTimeSec, 0), stardustEarned: Math.floor(num(stats.stardustEarned, 0)),
    },
    bestTimes: { survivedSec: num(bt.survivedSec, 0), fastestWinSec: typeof bt.fastestWinSec === 'number' && Number.isFinite(bt.fastestWinSec) ? bt.fastestWinSec : null },
    hintsDone: { move: bool(hd.move, false), reel: bool(hd.reel, false) },
  };
  return out;
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/** In-memory storage for tests / when localStorage is blocked. */
export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

export function safeStorage(): StorageLike {
  try {
    const s = window.localStorage;
    const k = '__starflail_probe';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return new MemoryStorage(); }
}

export interface LoadResult { data: SaveData; recovered: boolean }

/** Parse a stored blob. On corruption the bad blob is copied to BACKUP_KEY and defaults are returned. */
export function loadSave(storage: StorageLike): LoadResult {
  let blob: string | null = null;
  try { blob = storage.getItem(SAVE_KEY); } catch { blob = null; }
  if (blob === null) return { data: defaultSave(), recovered: false };
  let parsed: unknown;
  try { parsed = JSON.parse(blob); } catch { parsed = undefined; }
  const migrated = migrate(parsed);
  if (!migrated) {
    try { storage.setItem(BACKUP_KEY, blob); } catch { /* quota: nothing more we can do */ }
    return { data: defaultSave(), recovered: true };
  }
  // saves from a NEWER build: keep a backup before we overwrite them with v1
  if (isObj(parsed) && typeof parsed.version === 'number' && parsed.version > SAVE_VERSION) {
    try { storage.setItem(BACKUP_KEY, blob); } catch { /* ignore */ }
  }
  return { data: migrated, recovered: false };
}

/** Owns the live save object and debounces writes (flush on hide/unload via flush()). */
export class SaveStore {
  data: SaveData;
  recovered: boolean;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  writes = 0;
  constructor(private readonly storage: StorageLike, readonly debounceMs = 400) {
    const r = loadSave(storage);
    this.data = r.data; this.recovered = r.recovered;
  }
  /** Mark dirty and schedule a write. */
  commit(): void {
    this.dirty = true;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.debounceMs);
  }
  flush(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) return;
    this.dirty = false;
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(this.data)); this.writes++; } catch { /* quota / private mode: play on */ }
  }
}

// ---------------------------------------------------------------- ownership helpers (meta-unlocks.md)
export const FREE_SHIP = SHIPS[0].id;
export const FREE_ORB = ORBS[0].id;

export function ownsUnlock(s: SaveData, id: string): boolean {
  return id === FREE_SHIP || id === FREE_ORB || s.unlocks.includes(id);
}
export function ownsCosmetic(s: SaveData, slot: CosmeticSlot, id: string): boolean {
  const c = COSMETICS.find((x) => x.slot === slot && x.id === id);
  if (!c) return false;
  if ('free' in c.price) return true;
  if (s.cosmetics.includes(`${slot}:${id}`)) return true;
  if ('sku' in c.price) { const sku = SKUS.find((k) => k.sku === (c.price as { sku: string }).sku); return !!sku && s.entitlements.includes(sku.sku) || s.entitlements.some((e) => SKUS.find((k) => k.sku === e)?.grants.includes(id)); }
  return false;
}
export function ownedMeta(s: SaveData): string[] { return META_UNLOCKS.filter((m) => s.unlocks.includes(m.id)).map((m) => m.id); }

export type BuyResult = 'ok' | 'owned' | 'poor' | 'unknown' | 'locked';
/** Spend stardust on a ship / orb / pack. Idempotent (double click safe). Auto-equips ships/orbs. */
export function buyUnlock(s: SaveData, id: string): BuyResult {
  const cost = SHIPS.find((x) => x.id === id)?.unlockCost ?? ORBS.find((x) => x.id === id)?.unlockCost ?? META_UNLOCKS.find((x) => x.id === id)?.cost;
  if (cost === undefined) return 'unknown';
  if (ownsUnlock(s, id)) return 'owned';
  if (s.stardust < cost) return 'poor';
  s.stardust -= cost; s.unlocks.push(id);
  if (SHIPS.some((x) => x.id === id)) s.equipped.ship = id;
  if (ORBS.some((x) => x.id === id)) s.equipped.orb = id;
  return 'ok';
}
export function buyCosmetic(s: SaveData, slot: CosmeticSlot, id: string): BuyResult {
  const c = COSMETICS.find((x) => x.slot === slot && x.id === id);
  if (!c) return 'unknown';
  if (ownsCosmetic(s, slot, id)) return 'owned';
  if (!('stardust' in c.price)) return 'locked'; // supporter items: store task
  if (s.stardust < c.price.stardust) return 'poor';
  s.stardust -= c.price.stardust; s.cosmetics.push(`${slot}:${id}`);
  s.equipped[slot] = id;
  return 'ok';
}
export function equip(s: SaveData, kind: 'ship' | 'orb' | CosmeticSlot, id: string): boolean {
  const owned = kind === 'ship' || kind === 'orb' ? ownsUnlock(s, id) && (kind === 'ship' ? SHIPS : ORBS).some((x) => x.id === id) : ownsCosmetic(s, kind, id);
  if (!owned) return false;
  s.equipped[kind] = id;
  return true;
}

/** Fold a finished run into the save (stats, best times, stardust). Returns the stardust banked. */
export function recordRun(s: SaveData, r: { timeSec: number; kills: number; bossKills: number; won: boolean; stardust: number }): { newBest: boolean; banked: number } {
  s.stardust += r.stardust;
  s.stats.runs++; s.stats.kills += r.kills; s.stats.bossKills += r.bossKills; s.stats.totalTimeSec += r.timeSec; s.stats.stardustEarned += r.stardust;
  const newBest = r.timeSec > s.bestTimes.survivedSec;
  if (newBest) s.bestTimes.survivedSec = r.timeSec;
  if (r.won) {
    s.stats.wins++;
    if (s.bestTimes.fastestWinSec === null || r.timeSec < s.bestTimes.fastestWinSec) s.bestTimes.fastestWinSec = r.timeSec;
  }
  return { newBest, banked: r.stardust };
}
