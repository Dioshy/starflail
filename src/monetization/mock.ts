import { SKUS } from '../data';
import { fakeAd, fakeCheckout } from './mockUi';
import type { EntitlementStore, MonetizationProvider, RewardedPlacement } from './types';
import { fmtEur } from './util';

/** Dev default. Fake ad and checkout modals; grants entitlements locally. Set `autoComplete` for tests / screenshots. */
export class MockProvider implements MonetizationProvider {
  readonly platform = 'mock' as const;
  readonly capabilities = { rewarded: true, interstitial: true, purchases: true };
  constructor(private readonly ents: EntitlementStore, private readonly auto = false) {}
  async init(): Promise<void> { /* nothing to load */ }
  showRewarded(p: RewardedPlacement): Promise<boolean> { return this.auto ? Promise.resolve(true) : fakeAd(p, true); }
  async showInterstitial(): Promise<void> { if (!this.auto) await fakeAd('interstitial', false); }
  async purchase(sku: string): Promise<{ ok: boolean }> {
    const def = SKUS.find((k) => k.sku === sku);
    if (!def) return { ok: false };
    const ok = this.auto || (await fakeCheckout(def.name, fmtEur(def.priceEurCents)));
    if (ok) this.ents.grant(sku);
    return { ok };
  }
  async restore(): Promise<string[]> { return this.ents.restore(); }
  getEntitlements(): string[] { return this.ents.list(); }
}
