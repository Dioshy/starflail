// Monetization contract (design/MONETIZATION.md). Money buys cosmetics, noAds and supporter status ONLY.
export type RewardedPlacement = 'secondWind' | 'doubleStardust';
export type Platform = 'mock' | 'web' | 'crazygames' | 'poki' | 'itch';

export interface MonetizationProvider {
  readonly platform: Platform;
  /** What this build can do. UI hides what is false; nothing is ever assumed. */
  readonly capabilities: { rewarded: boolean; interstitial: boolean; purchases: boolean };
  /** Never rejects. Resolves (possibly after a timeout) even when an SDK is missing or blocked. */
  init(): Promise<void>;
  /** true = the player earned the reward. false = skipped, failed, blocked, timed out or no fill. Never rejects. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
  /** Never rejects. Resolves when the ad is done or could not be shown. */
  showInterstitial(): Promise<void>;
  /** ok=true only when the entitlement was granted locally. Never rejects. */
  purchase(sku: string): Promise<{ ok: boolean }>;
  /** Re-grant everything this device/account is known to own. Returns the owned SKU / entitlement ids. */
  restore(): Promise<string[]>;
  getEntitlements(): string[];
}

/** Where entitlements live (the save, plus a backup key). Providers never touch the save directly. */
export interface EntitlementStore {
  list(): string[];
  /** idempotent; persists immediately */
  grant(sku: string): string[];
  /** merge the backup into the save; returns the full list */
  restore(): string[];
}

/** Hard ceilings so a dead SDK can never freeze the game. */
export const TIMEOUTS = { init: 4000, rewarded: 120_000, interstitial: 90_000, rewardedStart: 8000 } as const;
