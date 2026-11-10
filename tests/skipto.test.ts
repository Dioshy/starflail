// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { parseParams } from '../src/game/params';

const ctx: unknown = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : ctx), set: () => true, apply: () => ctx });
let clock = 1000;
beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
  vi.stubGlobal('requestAnimationFrame', () => 0);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function boot(q: string): Game {
  localStorage.clear(); document.body.innerHTML = '';
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  return new Game(canvas, parseParams(q));
}
const frame = (g: Game): void => (g as unknown as { frame(n: number): void }).frame((clock += 16));

describe('?skipTo regression (Hue: skipTo=535 rendered blank at 0:00)', { timeout: 30000 }, () => {
  it.each([200, 535, 545])('skipTo=%i starts a live run at >= that time with a populated world', (sec) => {
    for (const seed of [1, 2, 3]) {
      const g = boot(`?skipTo=${sec}&seed=${seed}`);
      expect((g as unknown as { state: string }).state).toBe('run');
      frame(g); // the fast-forward runs inside the frame loop, sliced by a time budget
      expect(g.world.time).toBeGreaterThanOrEqual(sec);
      expect(g.world.outcome).toBeNull();
      expect(g.world.enemies.count).toBeGreaterThan(0);
      for (let i = 0; i < 30; i++) frame(g);
      expect((g as unknown as { state: string }).state).toBe('run');
      expect(g.world.time).toBeGreaterThan(sec);
    }
  });

  it('a slow skip is spread over many frames instead of blocking one (page paints meanwhile)', () => {
    const g = boot('?skipTo=200&seed=1');
    let ticks = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (ticks += 1, clock + ticks)); // each clock read costs 1 ms
    let frames = 0;
    while (g.world.time < 200 && frames < 5000) { frame(g); frames++; if (frames === 1) expect(g.world.time).toBeLessThan(200); }
    expect(frames).toBeGreaterThan(1);
    expect(g.world.time).toBeGreaterThanOrEqual(200);
  });

  it('skipTo=545 has the Eclipse boss alive within a few ticks', () => {
    const g = boot('?skipTo=545&seed=1');
    for (let i = 0; i < 120 && !g.world.activeBoss(); i++) frame(g);
    expect(g.world.activeBoss()?.kind).toBe('eclipse');
  });
});
