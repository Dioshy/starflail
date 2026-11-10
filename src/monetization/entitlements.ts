// Entitlement bookkeeping. Owned SKUs live in SaveData.entitlements and are mirrored to a separate backup key so a
// corrupted/reset save does not lose purchases ("Restore purchases" merges the mirror back).
import { COSMETICS, ENTITLEMENTS, SKUS } from '../data';
import type { SaveData, SaveStore, StorageLike } from '../game/save';
import type { EntitlementStore } from './types';

export const LEDGER_KEY = 'starflail.entitlements';
const isEnt = (id: string): boolean => (ENTITLEMENTS as readonly string[]).includes(id);

export const hasNoAds = (s: SaveData): boolean => s.entitlements.includes('noAds') || s.entitlements.includes('supporter_pack');
export const isSupporter = (s: SaveData): boolean => s.entitlements.includes('supporter') || s.entitlements.includes('supporter_pack');
export const ownsSku = (s: SaveData, sku: string): boolean => s.entitlements.includes(sku);

/** Grant an SKU into the save: the SKU id, its entitlement ids and one `slot:id` per cosmetic. Idempotent. Returns cosmetic ids newly owned. */
export function grantSku(s: SaveData, sku: string): string[] {
  const def = SKUS.find((k) => k.sku === sku);
  if (!def) return [];
  const added: string[] = [];
  if (!s.entitlements.includes(sku)) s.entitlements.push(sku);
  for (const g of def.grants) {
    if (isEnt(g)) { if (!s.entitlements.includes(g)) s.entitlements.push(g); continue; }
    for (const c of COSMETICS) {
      if (c.id !== g || c.id === 'default' || c.id === 'none') continue;
      const key = `${c.slot}:${c.id}`;
      if (!s.cosmetics.includes(key)) { s.cosmetics.push(key); added.push(c.id); }
    }
  }
  return added;
}

/** Equip every cosmetic an SKU carries (post-purchase convenience). */
export function equipSkuCosmetics(s: SaveData, sku: string): void {
  const def = SKUS.find((k) => k.sku === sku);
  if (!def) return;
  for (const g of def.grants) for (const c of COSMETICS) if (c.id === g && !isEnt(g)) s.equipped[c.slot] = c.id;
}

export class SaveEntitlements implements EntitlementStore {
  constructor(private readonly store: SaveStore, private readonly storage: StorageLike) {}
  list(): string[] { return [...this.store.data.entitlements]; }
  grant(sku: string): string[] {
    const added = grantSku(this.store.data, sku);
    this.store.commit(); this.store.flush();
    this.mirror();
    return added;
  }
  restore(): string[] {
    let ids: unknown;
    try { ids = JSON.parse(this.storage.getItem(LEDGER_KEY) ?? '[]'); } catch { ids = []; }
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string' && SKUS.some((k) => k.sku === id)) grantSku(this.store.data, id);
    this.store.commit(); this.store.flush();
    this.mirror();
    return this.list();
  }
  private mirror(): void {
    try { this.storage.setItem(LEDGER_KEY, JSON.stringify(this.store.data.entitlements.filter((e) => SKUS.some((k) => k.sku === e)))); } catch { /* blocked storage */ }
  }
}
