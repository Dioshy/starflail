import { expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { SpatialHash } from '../src/core/spatialHash';

it('matches a brute-force circle overlap check', () => {
  const rng = new Rng(42);
  const h = new SpatialHash(64, 1000, 16); // small capacity to exercise growth
  const N = 600;
  for (let i = 0; i < N; i++) h.insert(rng.range(-1200, 1200), rng.range(-1200, 1200), rng.range(2, 40));
  const out: number[] = [];
  for (let q = 0; q < 300; q++) {
    const x = rng.range(-1200, 1200), y = rng.range(-1200, 1200), r = rng.range(0, 300);
    h.query(x, y, r, out);
    const brute: number[] = [];
    for (let i = 0; i < N; i++) {
      const dx = h.x[i] - x, dy = h.y[i] - y, rr = h.r[i] + r;
      if (dx * dx + dy * dy <= rr * rr) brute.push(i);
    }
    expect([...out].sort((a, b) => a - b)).toEqual(brute);
  }
});
