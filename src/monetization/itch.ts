import type { EntitlementStore, MonetizationProvider } from './types';

/** itch.io build: no ads. Purchases open the itch page (no verifiable callback exists for HTML5 embeds). */
export class ItchProvider implements MonetizationProvider {
  readonly platform = 'itch' as const;
  readonly capabilities = { rewarded: false, interstitial: false, purchases: true };
  constructor(private readonly ents: EntitlementStore, private readonly env: Record<string, unknown> = import.meta.env, private readonly open: (u: string) => void = (u) => { window.open(u, '_blank', 'noopener'); }) {}
  async init(): Promise<void> { /* nothing to load */ }
  async showRewarded(): Promise<boolean> { return false; }
  async showInterstitial(): Promise<void> { /* none */ }
  async purchase(): Promise<{ ok: boolean }> {
    const url = this.env.VITE_ITCH_URL;
    if (typeof url === 'string' && /^https:\/\//.test(url)) { try { this.open(url); } catch { /* popup blocked */ } }
    return { ok: false };
  }
  async restore(): Promise<string[]> { return this.ents.restore(); }
  getEntitlements(): string[] { return this.ents.list(); }
}
