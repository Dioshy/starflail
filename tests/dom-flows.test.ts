// @vitest-environment happy-dom
// Headless DOM proof of the monetization and input flows, driving the real Game controller (no browser, no real SDKs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_POLICY } from '../src/data';
import { Game, RESULTS_LOCK_MS } from '../src/game/game';
import { parseParams } from '../src/game/params';
import { ownsCosmetic } from '../src/game/save';

// ---- harness
/** A canvas 2D context that accepts every call and returns itself (gradients etc.). */
function stubCtx(): unknown {
  const fn: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : fn),
    set: () => true,
    apply: () => fn,
  });
  return fn;
}

let clock = 1000;
const advance = (ms: number): number => (clock += ms);
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

interface Priv {
  frame(now: number): void;
  state: string; revivePending: boolean; runIndex: number;
  startRun(): void; goStore(): void; goHangar(): void; goTitle(): void;
}
const P = (g: Game): Priv => g as unknown as Priv;

function boot(query = '?mockAuto=1&seed=7&give=0'): Game {
  localStorage.clear();
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const g = new Game(canvas, parseParams(query));
  return g;
}
/** run N frames of 50 ms */
function frames(g: Game, n: number): void { for (let i = 0; i < n; i++) P(g).frame(advance(50)); }
/** play (idle) until the run ends one way or another: death prompt or results */
function die(g: Game, atSec = 90): void {
  g.world.time = atSec;
  g.world.forceDeath();
  for (let i = 0; i < 60 && P(g).state === 'run' && !P(g).revivePending; i++) P(g).frame(advance(50));
}
const click = (sel: string): void => { const el = document.querySelector<HTMLElement>(sel); if (!el) throw new Error(`missing ${sel}`); el.click(); };
const key = (code: string, type: 'keydown' | 'keyup' = 'keydown'): void => { window.dispatchEvent(new KeyboardEvent(type, { code })); };

beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => stubCtx()) as never);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('results screen input (B1)', () => {
  it('Space / reel key never restarts; nothing restarts inside the lockout; Enter restarts after it', () => {
    const g = boot();
    expect(P(g).state).toBe('run');
    die(g); // first death of a mock (rewarded) provider shows the Second Wind prompt
    click('[data-act=revive-no]');
    expect(P(g).state).toBe('results');
    // mash the reel key through the lockout and well beyond it
    for (let i = 0; i < 30; i++) { key('Space'); key('Space', 'keyup'); P(g).frame(advance(50)); }
    expect(P(g).state).toBe('results');
    // Enter inside the lockout is swallowed too
    const g2 = boot();
    die(g2); click('[data-act=revive-no]');
    key('Enter'); P(g2).frame(advance(RESULTS_LOCK_MS - 100));
    expect(P(g2).state).toBe('results');
    advance(200);
    key('Enter'); P(g2).frame(advance(16));
    expect(P(g2).state).toBe('run');
  });

  it('the GO AGAIN button ignores clicks inside the lockout and works after it', () => {
    const g = boot();
    die(g); click('[data-act=revive-no]');
    click('.res-actions .btn-primary');
    expect(P(g).state).toBe('results');
    advance(RESULTS_LOCK_MS + 10);
    click('.res-actions .btn-primary');
    expect(P(g).state).toBe('run');
  });

  it('restart from results to a live run takes one frame (< 2 s budget)', () => {
    const g = boot();
    die(g); click('[data-act=revive-no]');
    advance(RESULTS_LOCK_MS + 10);
    const t0 = clock;
    key('Enter'); P(g).frame(advance(16));
    expect(P(g).state).toBe('run');
    expect(clock - t0).toBeLessThan(2000);
  });
});

describe('monetization flows (mock provider, auto-complete)', () => {
  it('mock purchase of supporter_pack equips gold, prism and rainbow, grants noAds + supporter', async () => {
    const g = boot('?mockAuto=1');
    P(g).goStore();
    click('[data-act=buy][data-sku=supporter_pack]');
    await flush();
    const d = g.store.data;
    expect(d.entitlements).toEqual(expect.arrayContaining(['supporter_pack', 'noAds', 'supporter']));
    expect(d.equipped.shipSkin).toBe('gold');
    expect(d.equipped.orbSkin).toBe('prism');
    expect(d.equipped.trail).toBe('rainbow');
    expect(ownsCosmetic(d, 'shipSkin', 'gold') && ownsCosmetic(d, 'orbSkin', 'prism') && ownsCosmetic(d, 'trail', 'rainbow')).toBe(true);
    expect(document.querySelector('.supporter-banner')).not.toBeNull();
  });

  it('a supporter is never shown an ad: free Second Wind, no interstitial', async () => {
    const g = boot('?mockAuto=1&seed=3&own=supporter_pack');
    for (let r = 0; r < 5; r++) {
      die(g);
      const yes = document.querySelector<HTMLElement>('[data-act=revive-yes]');
      if (r === 0) { expect(yes?.textContent).toBe('Revive'); }
      click('[data-act=revive-no]');
      advance(RESULTS_LOCK_MS + 10);
      click('.res-actions .btn:not(.btn-primary)'); // Hangar
      await flush();
      P(g).startRun();
    }
    expect(g.ads.adCalls).toBe(0);
  });

  it("a non-supporter sees 'Watch ad & revive' and it works once per run", async () => {
    const g = boot('?mockAuto=1&seed=5');
    die(g);
    const yes = document.querySelector<HTMLElement>('[data-act=revive-yes]')!;
    expect(yes.textContent).toBe('Watch ad & revive');
    // equal size to "No thanks" is checked in CSS: both use btn-big
    expect(document.querySelector('[data-act=revive-no]')!.className).toContain('btn-big');
    expect(yes.className).toContain('btn-big');
    yes.click(); await flush(); await flush();
    expect(g.world.outcome).toBeNull();
    expect(g.world.ship.hp).toBe(g.world.ship.maxHp);
    expect(g.ads.adCalls).toBe(1);
    // die again in the same run: straight to results, no second prompt, no second ad
    die(g, 120);
    for (let i = 0; i < 40 && P(g).state === 'run'; i++) P(g).frame(advance(50));
    expect(P(g).state).toBe('results');
    expect(P(g).revivePending).toBe(false);
    expect(g.ads.adCalls).toBe(1);
    // and a fresh run gets the offer back
    P(g).startRun();
    die(g);
    expect(document.querySelector('[data-act=revive-yes]')!.textContent).toBe('Watch ad & revive');
  });

  it('no ad is requested while a run is live', async () => {
    const g = boot('?mockAuto=1&seed=9');
    frames(g, 100);
    expect(g.ads.isRunActive).toBe(true);
    expect(g.ads.adCalls).toBe(0);
    expect(await g.ads.requestDoubleStardust()).toBe(false);
    expect(await g.ads.maybeInterstitial()).toBe(false);
    expect(g.ads.adCalls).toBe(0);
  });

  it('doubleStardust doubles the payout exactly once', async () => {
    const g = boot('?mockAuto=1&seed=11');
    const before = g.store.data.stardust;
    die(g, 240); click('[data-act=revive-no]');
    const earned = g.world.stardustEarned();
    expect(earned).toBeGreaterThan(0);
    expect(g.store.data.stardust).toBe(before + earned); // banked before any ad
    click('[data-act=double]');
    await flush(); await flush();
    expect(g.store.data.stardust).toBe(before + earned * AD_POLICY.doubleStardustMul);
    expect(document.querySelector('[data-act=double]')).toBeNull(); // offer is gone: once per results
    expect(g.ads.adCalls).toBe(1);
  });

  it('no interstitial after run ends 1 and 2 (back to the hangar)', async () => {
    const g = boot('?mockAuto=1&seed=13');
    for (let r = 1; r <= 2; r++) {
      die(g);
      click('[data-act=revive-no]');
      advance(RESULTS_LOCK_MS + 10);
      click('.res-actions .btn:not(.btn-primary)');
      await flush();
      expect(P(g).state).toBe('hangar');
      expect(g.ads.adCalls).toBe(0);
      P(g).startRun();
    }
  });
});
