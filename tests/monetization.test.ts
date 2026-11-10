import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_POLICY, COSMETICS } from '../src/data';
import { MemoryStorage, SaveStore, ownsCosmetic } from '../src/game/save';
import { World } from '../src/game/sim';
import { AdService } from '../src/monetization/ads';
import { LEDGER_KEY, SaveEntitlements, hasNoAds, isSupporter } from '../src/monetization/entitlements';
import { MockProvider } from '../src/monetization/mock';
import { CrazyGamesProvider, PokiProvider } from '../src/monetization/portal';
import { TIMEOUTS, type MonetizationProvider, type RewardedPlacement } from '../src/monetization/types';
import { WebProvider, parsePurchaseReturn, stripeLinkFor } from '../src/monetization/web';
import { withTimeout } from '../src/monetization/util';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(opts: { rewarded?: boolean; interstitial?: boolean; runs?: () => number } = {}) {
  const storage = new MemoryStorage();
  const store = new SaveStore(storage);
  const ents = new SaveEntitlements(store, storage);
  const calls = { rewarded: [] as RewardedPlacement[], interstitial: 0 };
  const provider: MonetizationProvider = {
    platform: 'mock', capabilities: { rewarded: opts.rewarded ?? true, interstitial: opts.interstitial ?? true, purchases: true },
    init: async () => {}, showRewarded: async (p) => { calls.rewarded.push(p); return true; },
    showInterstitial: async () => { calls.interstitial++; }, purchase: async (sku) => { ents.grant(sku); return { ok: true }; },
    restore: async () => ents.restore(), getEntitlements: () => ents.list(),
  };
  const hooks = { start: 0, end: 0 };
  let now = 1_000_000;
  const ads = new AdService(provider, { noAds: () => hasNoAds(store.data), runsCompleted: opts.runs ?? (() => store.data.stats.runs) },
    { onAdStart: () => { hooks.start++; }, onAdEnd: () => { hooks.end++; } }, () => now);
  return { storage, store, ents, provider, calls, hooks, ads, advance: (ms: number) => { now += ms; } };
}
/** finish one run and its results screen */
const finishRun = (t: ReturnType<typeof setup>): void => { t.ads.beginRun(); t.store.data.stats.runs++; t.ads.endRun(); t.ads.beginResults(); };

describe('entitlements', () => {
  it('grant persists in the save and survives a reload', () => {
    const t = setup();
    t.ents.grant('supporter_pack');
    expect(isSupporter(t.store.data) && hasNoAds(t.store.data)).toBe(true);
    for (const id of ['gold', 'prism', 'rainbow']) expect(ownsCosmetic(t.store.data, COSMETICS.find((c) => c.id === id)!.slot, id)).toBe(true);
    const reloaded = new SaveStore(t.storage);
    expect(reloaded.data.entitlements).toEqual(expect.arrayContaining(['supporter_pack', 'noAds', 'supporter']));
  });
  it('grant is idempotent and ignores unknown SKUs', () => {
    const t = setup();
    t.ents.grant('bundle_frost'); t.ents.grant('bundle_frost'); t.ents.grant('nope');
    expect(t.store.data.entitlements).toEqual(['bundle_frost']);
    expect(t.store.data.cosmetics.sort()).toEqual(['orbSkin:ice', 'shipSkin:void', 'trail:pixel']);
  });
  it('restore recovers purchases after the save is lost', () => {
    const t = setup();
    t.ents.grant('supporter_pack'); t.ents.grant('bundle_inferno');
    t.storage.removeItem('starflail.save'); // fresh save, ledger mirror survives
    const store2 = new SaveStore(t.storage);
    expect(store2.data.entitlements).toEqual([]);
    const restored = new SaveEntitlements(store2, t.storage).restore();
    expect(restored).toEqual(expect.arrayContaining(['supporter_pack', 'bundle_inferno', 'noAds']));
    expect(store2.data.cosmetics).toContain('shipSkin:ember');
  });
  it('restore ignores a tampered ledger', () => {
    const t = setup();
    t.storage.setItem(LEDGER_KEY, JSON.stringify(['hax', 42, 'bundle_frost']));
    expect(t.ents.restore()).toEqual(['bundle_frost']);
    t.storage.setItem(LEDGER_KEY, '{not json');
    expect(() => t.ents.restore()).not.toThrow();
  });
  it('mock provider purchase (auto) grants; purchase of unknown sku does not', async () => {
    const t = setup();
    const p = new MockProvider(t.ents, true);
    expect(await p.purchase('nope')).toEqual({ ok: false });
    expect(await p.purchase('supporter_pack')).toEqual({ ok: true });
    expect(p.getEntitlements()).toContain('supporter');
  });
});

describe('interstitial caps', () => {
  it('never on the first two runs, first allowed after the third', async () => {
    const t = setup();
    finishRun(t); expect(await t.ads.maybeInterstitial()).toBe(false);
    finishRun(t); expect(await t.ads.maybeInterstitial()).toBe(false);
    finishRun(t); expect(await t.ads.maybeInterstitial()).toBe(true);
    expect(t.calls.interstitial).toBe(1);
  });
  it('at most once per 3 runs and at least 180 s apart', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) finishRun(t);
    expect(await t.ads.maybeInterstitial()).toBe(true);
    finishRun(t); t.advance(10 * 60_000); expect(await t.ads.maybeInterstitial()).toBe(false); // only 1 run since
    finishRun(t); finishRun(t); // 3 runs since
    t.advance(-10 * 60_000 + 60_000); // moves the clock to 1 min after the last ad... gap rule
    expect(t.ads.canShowInterstitial()).toBe(false);
    t.advance(AD_POLICY.interstitialMinGapSec * 1000);
    expect(t.ads.canShowInterstitial()).toBe(true);
  });
  it('a rewarded ad on this results screen suppresses the interstitial', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) finishRun(t);
    expect(await t.ads.requestDoubleStardust()).toBe(true);
    t.advance(AD_POLICY.interstitialMinGapSec * 1000 + 1);
    expect(t.ads.canShowInterstitial()).toBe(false);
  });
  it('supporters (noAds) never see an interstitial', async () => {
    const t = setup();
    t.ents.grant('supporter_pack');
    for (let i = 0; i < 12; i++) { finishRun(t); t.advance(10 * 60_000); expect(await t.ads.maybeInterstitial()).toBe(false); }
    expect(t.calls.interstitial).toBe(0);
  });
  it('platforms without ads never request one', async () => {
    const t = setup({ interstitial: false });
    for (let i = 0; i < 6; i++) { finishRun(t); t.advance(600_000); expect(await t.ads.maybeInterstitial()).toBe(false); }
  });
});

describe('no ads during a run', () => {
  it('every ad entry point is refused while a run is active', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) finishRun(t);
    t.ads.beginRun();
    expect(t.ads.secondWindOffer()).toBeNull();
    expect(await t.ads.requestSecondWind()).toBe(false);
    expect(await t.ads.requestDoubleStardust()).toBe(false);
    expect(await t.ads.maybeInterstitial()).toBe(false);
    expect(t.calls.interstitial + t.calls.rewarded.length).toBe(0);
    expect(t.hooks.start).toBe(0);
  });
  it('pauses and mutes around an ad (hooks balanced) even if the provider throws', async () => {
    const t = setup();
    t.provider.showRewarded = async () => { throw new Error('sdk exploded'); };
    t.ads.beginRun(); t.ads.pauseForPrompt();
    expect(await t.ads.requestSecondWind()).toBe(false);
    expect(t.hooks).toEqual({ start: 1, end: 1 });
  });
});

describe('second wind', () => {
  it('is offered once per run, resets next run', async () => {
    const t = setup();
    t.ads.beginRun(); t.ads.pauseForPrompt();
    expect(t.ads.secondWindOffer()).toBe('ad');
    expect(await t.ads.requestSecondWind()).toBe(true);
    expect(t.ads.secondWindOffer()).toBeNull();
    expect(await t.ads.requestSecondWind()).toBe(false);
    expect(t.calls.rewarded).toEqual(['secondWind']);
    t.ads.endRun(); t.ads.beginRun(); t.ads.pauseForPrompt();
    expect(t.ads.secondWindOffer()).toBe('ad');
  });
  it('is free (no video) for supporters and on ad-less platforms', async () => {
    const a = setup(); a.ents.grant('supporter_pack'); a.ads.beginRun(); a.ads.pauseForPrompt();
    expect(a.ads.secondWindOffer()).toBe('free'); expect(await a.ads.requestSecondWind()).toBe(true); expect(a.calls.rewarded).toEqual([]);
    const b = setup({ rewarded: false }); b.ads.beginRun(); b.ads.pauseForPrompt();
    expect(b.ads.secondWindOffer()).toBe('free');
  });
  it('a failed ad still uses up the offer and never revives', async () => {
    const t = setup(); t.provider.showRewarded = async () => false;
    t.ads.beginRun(); t.ads.pauseForPrompt();
    expect(await t.ads.requestSecondWind()).toBe(false);
    expect(t.ads.secondWindOffer()).toBeNull();
  });
  it('World.revive: full heal, i-frames, clears nearby non-boss enemies, only after death', () => {
    const w = new World({ seed: 7, noSpawn: true });
    expect(w.revive(2, 320)).toBe(false);
    w.ship.hp = 1; w.forceDeath('test');
    expect(w.outcome).toBe('dead');
    expect(w.revive(AD_POLICY.secondWindIframesSec, AD_POLICY.secondWindClearRadius)).toBe(true);
    expect(w.outcome).toBeNull(); expect(w.ship.hp).toBe(w.ship.maxHp); expect(w.ship.iframes).toBe(2);
    expect(w.events.some((e) => e.type === 'shockwave')).toBe(true);
  });
});

describe('provider time-outs and fallbacks', () => {
  it('withTimeout resolves the fallback for a hung or rejected promise', async () => {
    const hung = withTimeout(new Promise<number>(() => {}), 1000, -1);
    vi.advanceTimersByTime(1000); expect(await hung).toBe(-1);
    expect(await withTimeout(Promise.reject(new Error('x')), 1000, 5)).toBe(5);
  });
  it('AdService gives up on a provider that never answers', async () => {
    const t = setup();
    t.provider.showRewarded = () => new Promise<boolean>(() => {});
    t.ads.beginRun(); t.ads.pauseForPrompt();
    const r = t.ads.requestSecondWind();
    await vi.advanceTimersByTimeAsync(TIMEOUTS.rewarded + 1);
    expect(await r).toBe(false);
    expect(t.hooks).toEqual({ start: 1, end: 1 });
  });
  it('AdService gives up on a hung interstitial', async () => {
    const t = setup(); t.provider.showInterstitial = () => new Promise<void>(() => {});
    for (let i = 0; i < 3; i++) finishRun(t);
    const r = t.ads.maybeInterstitial();
    await vi.advanceTimersByTimeAsync(TIMEOUTS.interstitial + 1);
    expect(await r).toBe(true); expect(t.hooks.end).toBe(1);
  });
  it('CrazyGames / Poki: a blocked SDK script means no ads, no throw, no hang', async () => {
    const fakeDoc = { head: { appendChild: (s: { onerror?: () => void }) => { setTimeout(() => s.onerror?.(), 5); } }, createElement: () => ({}) };
    vi.stubGlobal('document', fakeDoc);
    for (const P of [CrazyGamesProvider, PokiProvider]) {
      const t = setup(); const p = new P(t.ents);
      const init = p.init(); await vi.advanceTimersByTimeAsync(10); await init;
      expect(p.capabilities).toEqual({ rewarded: false, interstitial: false, purchases: false });
      expect(await p.showRewarded()).toBe(false);
      await p.showInterstitial();
      expect(await p.purchase()).toEqual({ ok: false });
    }
  });
  it('CrazyGames: SDK script that never loads times out', async () => {
    vi.stubGlobal('document', { head: { appendChild: () => {} }, createElement: () => ({}) });
    const p = new CrazyGamesProvider(setup().ents);
    const init = p.init(); await vi.advanceTimersByTimeAsync(TIMEOUTS.init + 1); await init;
    expect(p.capabilities.rewarded).toBe(false);
  });
  it('CrazyGames: maps rewarded to requestAd callbacks and midgame for interstitials', async () => {
    const seen: string[] = [];
    vi.stubGlobal('document', { head: { appendChild: (s: { onload?: () => void }) => { setTimeout(() => s.onload?.(), 1); } }, createElement: () => ({}) });
    vi.stubGlobal('CrazyGames', { SDK: { init: async () => {}, ad: { requestAd: (type: string, cb: { adFinished(): void; adError(): void }) => { seen.push(type); if (type === 'rewarded') cb.adFinished(); else cb.adError(); } } } });
    const p = new CrazyGamesProvider(setup().ents);
    const init = p.init(); await vi.advanceTimersByTimeAsync(10); await init;
    expect(p.capabilities.rewarded).toBe(true);
    expect(await p.showRewarded()).toBe(true);
    await p.showInterstitial();
    expect(seen).toEqual(['rewarded', 'midgame']);
  });
  it('Poki: rewardedBreak result is the reward; a rejecting SDK is a no', async () => {
    vi.stubGlobal('document', { head: { appendChild: (s: { onload?: () => void }) => { setTimeout(() => s.onload?.(), 1); } }, createElement: () => ({}) });
    const sdk = { init: async () => {}, rewardedBreak: async () => true, commercialBreak: async () => {} };
    vi.stubGlobal('PokiSDK', sdk);
    const p = new PokiProvider(setup().ents);
    const init = p.init(); await vi.advanceTimersByTimeAsync(10); await init;
    expect(await p.showRewarded()).toBe(true);
    sdk.rewardedBreak = async () => { throw new Error('blocked'); };
    expect(await p.showRewarded()).toBe(false);
  });
  it('web provider: payment link redirect, return grants, missing link is a clean no', async () => {
    const t = setup(); const go: string[] = [];
    const env = { VITE_STRIPE_LINK_SUPPORTER_PACK: 'https://buy.stripe.com/test_abc' };
    const p = new WebProvider(t.ents, env, { assign: (u) => { go.push(u); } });
    expect(await p.purchase('supporter_pack')).toEqual({ ok: false });
    expect(go).toEqual(['https://buy.stripe.com/test_abc']);
    expect(t.store.data.entitlements).toEqual([]); // honor-system grant happens on return only
    expect(await p.purchase('bundle_frost')).toEqual({ ok: false }); expect(go.length).toBe(1);
    expect(stripeLinkFor({ VITE_STRIPE_LINK_X: 'http://insecure' }, 'x')).toBeNull();
    expect(parsePurchaseReturn('?purchase=success&sku=supporter_pack')).toBe('supporter_pack');
    expect(parsePurchaseReturn('?purchase=success&sku=hax')).toBeNull();
    expect(parsePurchaseReturn('?sku=supporter_pack')).toBeNull();
  });
  it('web provider init grants on ?purchase=success and cleans the URL', async () => {
    const t = setup();
    let url = 'https://x.test/play?purchase=success&sku=bundle_inferno&keep=1';
    vi.stubGlobal('window', { location: { get search() { return new URL(url).search; }, get href() { return url; } }, history: { replaceState: (_a: unknown, _b: string, u: string) => { url = 'https://x.test' + u; } } });
    await new WebProvider(t.ents, {}).init();
    expect(t.store.data.entitlements).toContain('bundle_inferno');
    expect(url).toBe('https://x.test/play?keep=1');
  });
});

describe('platform selection', () => {
  it('defaults to mock in dev and to web (never fake checkout) in production', async () => {
    const { platformFromEnv } = await import('../src/monetization');
    expect(platformFromEnv(undefined, true)).toBe('mock');
    expect(platformFromEnv(undefined, false)).toBe('web');
    expect(platformFromEnv('bogus', false)).toBe('web');
    for (const p of ['mock', 'web', 'crazygames', 'poki', 'itch']) expect(platformFromEnv(p, false)).toBe(p);
  });
});
