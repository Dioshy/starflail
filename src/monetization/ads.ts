// Ad policy gate. EVERY ad request goes through here; nothing else may call the provider's ad methods.
// Rules (design/MONETIZATION.md section 2): never while a run is active, interstitial caps, never with noAds,
// second wind once per run, sim paused + audio muted for the duration of any ad.
import { AD_POLICY } from '../data';
import type { MonetizationProvider, RewardedPlacement } from './types';
import { TIMEOUTS } from './types';
import { withTimeout } from './util';

export interface AdHooks { onAdStart(): void; onAdEnd(): void }
export interface AdContext { noAds(): boolean; runsCompleted(): number }

export class AdService {
  private runActive = false;
  private secondWindUsed = false;
  private doubleUsed = false;
  private rewardedThisResults = false;
  private runsSinceInterstitial = 0;
  private lastAdAt: number | null = null; // ms, any kind of ad
  private busy = false;
  adCalls = 0;

  constructor(readonly provider: MonetizationProvider, private readonly ctx: AdContext, private readonly hooks: AdHooks, private readonly now: () => number = () => Date.now()) {}

  // ---- run lifecycle (the game calls these; the gate relies on them)
  beginRun(): void { this.runActive = true; this.secondWindUsed = false; }
  /** the run is over (death prompt or results): ads become legal */
  endRun(): void { this.runActive = false; this.runsSinceInterstitial++; }
  beginResults(): void { this.doubleUsed = false; this.rewardedThisResults = false; }
  get isRunActive(): boolean { return this.runActive; }

  // ---- second wind
  /** 'free' = revive without a video (no ad SDK or supporter); 'ad' = rewarded video; null = not offered */
  secondWindOffer(): 'free' | 'ad' | null {
    if (this.runActive || this.secondWindUsed || this.busy) return null;
    return this.ctx.noAds() || !this.provider.capabilities.rewarded ? 'free' : 'ad';
  }
  /** true = revive the player. Consumes the once-per-run offer whatever the outcome. */
  async requestSecondWind(): Promise<boolean> {
    const offer = this.secondWindOffer();
    if (offer === null) return false;
    this.secondWindUsed = true;
    if (offer === 'free') return true;
    return this.rewarded('secondWind');
  }

  // ---- double stardust
  canOfferDouble(): boolean { return !this.runActive && !this.doubleUsed && !this.busy && this.provider.capabilities.rewarded; }
  async requestDoubleStardust(): Promise<boolean> {
    if (!this.canOfferDouble()) return false;
    this.doubleUsed = true;
    const ok = await this.rewarded('doubleStardust');
    if (ok) this.rewardedThisResults = true;
    return ok;
  }

  // ---- interstitial (results -> hangar only)
  canShowInterstitial(): boolean {
    if (this.runActive || this.busy || !this.provider.capabilities.interstitial) return false;
    if (this.ctx.noAds()) return false;
    if (this.rewardedThisResults) return false;
    if (this.ctx.runsCompleted() <= AD_POLICY.interstitialGraceRuns) return false;
    if (this.runsSinceInterstitial < AD_POLICY.interstitialEveryRuns) return false;
    if (this.lastAdAt !== null && this.now() - this.lastAdAt < AD_POLICY.interstitialMinGapSec * 1000) return false;
    return true;
  }
  /** Call on the results -> hangar transition. Resolves when the transition may continue. */
  async maybeInterstitial(): Promise<boolean> {
    if (!this.canShowInterstitial()) return false;
    this.runsSinceInterstitial = 0;
    await this.wrap(async () => { await withTimeout(this.provider.showInterstitial(), TIMEOUTS.interstitial, undefined); });
    return true;
  }

  // ---- internals
  private async rewarded(p: RewardedPlacement): Promise<boolean> {
    let ok = false;
    await this.wrap(async () => { ok = await withTimeout(this.provider.showRewarded(p), TIMEOUTS.rewarded, false); });
    return ok;
  }
  private async wrap(fn: () => Promise<void>): Promise<void> {
    if (this.runActive || this.busy) return; // hard guard: no ad while a run is live
    this.busy = true; this.adCalls++;
    try { this.hooks.onAdStart(); } catch { /* hooks must not block */ }
    try { await fn(); } catch { /* provider failures are non-events */ }
    finally {
      this.busy = false; this.lastAdAt = this.now();
      try { this.hooks.onAdEnd(); } catch { /* ignore */ }
    }
  }
}
