import { ItchProvider } from './itch';
import { MockProvider } from './mock';
import { CrazyGamesProvider, PokiProvider } from './portal';
import type { EntitlementStore, MonetizationProvider, Platform } from './types';
import { WebProvider } from './web';

export * from './types';
export { AdService } from './ads';
export { SaveEntitlements, hasNoAds, isSupporter, ownsSku, grantSku, equipSkuCosmetics } from './entitlements';
export { fmtEur } from './util';

/** Unset/unknown: 'mock' in dev, 'web' in production builds. A production build can never ship fake checkout by accident. */
export function platformFromEnv(raw: unknown, dev: boolean = import.meta.env.DEV): Platform {
  return raw === 'web' || raw === 'crazygames' || raw === 'poki' || raw === 'itch' || raw === 'mock' ? raw : dev ? 'mock' : 'web';
}

/** `VITE_PLATFORM` picks the provider; anything unknown falls back to mock. */
export function createProvider(platform: Platform, ents: EntitlementStore, opts: { auto?: boolean } = {}): MonetizationProvider {
  switch (platform) {
    case 'web': return new WebProvider(ents);
    case 'itch': return new ItchProvider(ents);
    case 'crazygames': return new CrazyGamesProvider(ents);
    case 'poki': return new PokiProvider(ents);
    default: return new MockProvider(ents, opts.auto);
  }
}
