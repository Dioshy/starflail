import type { AdPolicyDef, CosmeticDef, SkuDef } from './types';

// design/MONETIZATION.md. Cosmetics never change stats (validate.ts has no stat field to check: by construction).
// Cosmetic ids are unique per slot; every id except 'default' is also unique across slots so SKU grants are unambiguous.

export const COSMETICS: CosmeticDef[] = [
  // ship skins
  { id: 'default', slot: 'shipSkin', name: 'Standard Hull', price: { free: true }, color: '#7df9ff' },
  { id: 'neon', slot: 'shipSkin', name: 'Neon Hull', price: { stardust: 150 }, color: '#ff3cf7' },
  { id: 'ember', slot: 'shipSkin', name: 'Ember Hull', price: { stardust: 220 }, color: '#ff7a1a' },
  { id: 'void', slot: 'shipSkin', name: 'Void Hull', price: { stardust: 320 }, color: '#7b5cff' },
  { id: 'gold', slot: 'shipSkin', name: 'Supporter Gold Hull', price: { sku: 'supporter_pack' }, color: '#ffd23f' },
  // orb skins
  { id: 'default', slot: 'orbSkin', name: 'Standard Orb', price: { free: true }, color: '#e8f6ff' },
  { id: 'plasma', slot: 'orbSkin', name: 'Plasma Orb', price: { stardust: 150 }, color: '#3cff9e' },
  { id: 'ice', slot: 'orbSkin', name: 'Ice Orb', price: { stardust: 220 }, color: '#9fe8ff' },
  { id: 'molten', slot: 'orbSkin', name: 'Molten Orb', price: { stardust: 320 }, color: '#ff4b2b' },
  { id: 'prism', slot: 'orbSkin', name: 'Supporter Prism Orb', price: { sku: 'supporter_pack' }, color: '#ffffff' },
  // trails
  { id: 'none', slot: 'trail', name: 'No Trail', price: { free: true } },
  { id: 'spark', slot: 'trail', name: 'Spark Trail', price: { stardust: 120 }, color: '#fff36b' },
  { id: 'ribbon', slot: 'trail', name: 'Ribbon Trail', price: { stardust: 180 }, color: '#ff8a3c' },
  { id: 'pixel', slot: 'trail', name: 'Pixel Trail', price: { stardust: 250 }, color: '#8a7bff' },
  { id: 'rainbow', slot: 'trail', name: 'Supporter Rainbow Trail', price: { sku: 'supporter_pack' } },
];

/** Non-cosmetic grants an SKU can carry. Neither changes gameplay. */
export const ENTITLEMENTS = ['noAds', 'supporter'] as const;

export const SKUS: SkuDef[] = [
  { sku: 'supporter_pack', name: 'Supporter Pack', priceEurCents: 499,
    description: 'Gold hull, Prism orb, Rainbow trail, no interstitial ads ever, a supporter badge, and our thanks. No gameplay power.',
    grants: ['gold', 'prism', 'rainbow', 'noAds', 'supporter'] },
  { sku: 'bundle_inferno', name: 'Inferno Bundle', priceEurCents: 199,
    description: 'Ember hull, Molten orb, Ribbon trail. All three can also be earned with stardust.',
    grants: ['ember', 'molten', 'ribbon'] },
  { sku: 'bundle_frost', name: 'Frostvoid Bundle', priceEurCents: 199,
    description: 'Void hull, Ice orb, Pixel trail. All three can also be earned with stardust.',
    grants: ['void', 'ice', 'pixel'] },
];

export const AD_POLICY: AdPolicyDef = {
  interstitialEveryRuns: 3, // at most one interstitial per 3 completed runs
  interstitialMinGapSec: 180, // and at least 3 min since the last ad of any kind
  interstitialGraceRuns: 2, // never during a player's first 2 runs ever
  secondWindHp: 3, // revive HP
  secondWindIframesSec: 2,
  secondWindClearRadius: 320, // enemies and projectiles within this are removed on revive (no XP)
  doubleStardustMul: 2,
};
