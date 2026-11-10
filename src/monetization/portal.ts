// CrazyGames + Poki. The SDK <script> is injected ONLY when that platform is selected, and every call is timed out.
import type { EntitlementStore, MonetizationProvider, Platform, RewardedPlacement } from './types';
import { TIMEOUTS } from './types';
import { loadScript, withTimeout } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

abstract class PortalProvider implements MonetizationProvider {
  abstract readonly platform: Platform;
  readonly capabilities = { rewarded: false, interstitial: false, purchases: false };
  protected ready = false;
  constructor(protected readonly ents: EntitlementStore) {}
  abstract init(): Promise<void>;
  async showRewarded(_p: RewardedPlacement): Promise<boolean> { return false; }
  async showInterstitial(): Promise<void> { /* overridden */ }
  // TODO(portal IAP): CrazyGames/Poki in-game purchase APIs are unverified. Until a human confirms them against the
  // current portal docs, real-money SKUs are hidden on portal builds (capabilities.purchases = false).
  async purchase(): Promise<{ ok: boolean }> { return { ok: false }; }
  async restore(): Promise<string[]> { return this.ents.restore(); }
  getEntitlements(): string[] { return this.ents.list(); }
}

export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
export class CrazyGamesProvider extends PortalProvider {
  readonly platform = 'crazygames' as const;
  private sdk(): Any { return (globalThis as Any).CrazyGames?.SDK; }
  async init(): Promise<void> {
    if (!(await loadScript(CRAZYGAMES_SDK_URL, TIMEOUTS.init))) return;
    try { await withTimeout(Promise.resolve(this.sdk()?.init?.()), TIMEOUTS.init, undefined); this.ready = !!this.sdk()?.ad; } catch { this.ready = false; }
    (this as { capabilities: PortalProvider['capabilities'] }).capabilities = { rewarded: this.ready, interstitial: this.ready, purchases: false };
  }
  private request(type: 'rewarded' | 'midgame'): Promise<boolean> {
    if (!this.ready) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      try {
        this.sdk().ad.requestAd(type, { adStarted: () => {}, adFinished: () => resolve(true), adError: () => resolve(false) });
      } catch { resolve(false); }
    });
  }
  async showRewarded(): Promise<boolean> { return withTimeout(this.request('rewarded'), TIMEOUTS.rewarded, false); }
  async showInterstitial(): Promise<void> { await withTimeout(this.request('midgame'), TIMEOUTS.interstitial, false); }
}

export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
export class PokiProvider extends PortalProvider {
  readonly platform = 'poki' as const;
  private sdk(): Any { return (globalThis as Any).PokiSDK; }
  async init(): Promise<void> {
    if (!(await loadScript(POKI_SDK_URL, TIMEOUTS.init))) return;
    try { await withTimeout(Promise.resolve(this.sdk()?.init?.()), TIMEOUTS.init, undefined); this.ready = typeof this.sdk()?.rewardedBreak === 'function'; } catch { this.ready = false; }
    (this as { capabilities: PortalProvider['capabilities'] }).capabilities = { rewarded: this.ready, interstitial: this.ready, purchases: false };
  }
  async showRewarded(): Promise<boolean> {
    if (!this.ready) return false;
    return withTimeout(Promise.resolve(this.sdk().rewardedBreak()).then((v: unknown) => v === true), TIMEOUTS.rewarded, false);
  }
  async showInterstitial(): Promise<void> {
    if (!this.ready) return;
    await withTimeout(Promise.resolve(this.sdk().commercialBreak()).then(() => undefined), TIMEOUTS.interstitial, undefined);
  }
}
