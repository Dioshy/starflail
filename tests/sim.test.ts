import { describe, expect, it } from 'vitest';
import { World, computeDamage } from '../src/game/sim';
import { TUNING } from '../src/game/tuning';
import { idle, randomIntents, scripted } from './helpers';

describe('tether', () => {
  it('never exceeds the hard max length over 10k random steps', () => {
    const w = new World({ seed: 7, god: true });
    const next = randomIntents(99);
    let worst = 0;
    for (let i = 0; i < 10000; i++) {
      w.step(next());
      const L = Math.hypot(w.orb.x - w.ship.x, w.orb.y - w.ship.y);
      worst = Math.max(worst, L);
      expect(L).toBeLessThanOrEqual(w.tether.maxLen + 1e-6);
    }
    expect(worst).toBeGreaterThan(TUNING.tetherLength * 0.9);
  });

  it('reel raises angular speed and conserves angular momentum within 10%', () => {
    // drag is legitimately dissipative, so disable it to isolate the reel's effect
    const w = new World({ seed: 1, noSpawn: true, tuning: { ...TUNING, orbDrag: 0 } });
    w.orb.x = w.orb.px = TUNING.tetherLength; w.orb.y = w.orb.py = 0;
    w.orb.vx = 0; w.orb.vy = 500; // tangential swing, ship stationary
    // settle one step so the spring state is consistent
    const ang = () => {
      const rx = w.orb.x - w.ship.x, ry = w.orb.y - w.ship.y;
      const h = rx * w.orb.vy - ry * w.orb.vx;
      return { h, omega: h / (rx * rx + ry * ry) };
    };
    for (let i = 0; i < 10; i++) w.step(idle());
    const before = ang();
    for (let i = 0; i < 40; i++) w.step({ ...idle(), reel: true });
    const after = ang();
    expect(after.omega).toBeGreaterThan(before.omega * 1.3);
    expect(Math.abs(after.h - before.h) / Math.abs(before.h)).toBeLessThan(0.1);
  });
});

describe('damage', () => {
  it('is 0 below the minimum damage speed', () => {
    expect(computeDamage(TUNING.minDamageSpeed - 1, TUNING)).toBe(0);
    expect(computeDamage(TUNING.minDamageSpeed + 100, TUNING)).toBeCloseTo(100 * TUNING.damagePerSpeed);
    const w = new World({ seed: 2, noSpawn: true });
    const e = w.spawnEnemy('mite', 200, 0)!;
    w.orb.x = w.orb.px = 150; w.orb.y = w.orb.py = 0; w.orb.vx = 100; w.orb.vy = 0; // slow orb through the enemy
    for (let i = 0; i < 30; i++) w.step(idle());
    expect(e.hp).toBe(TUNING.mite.hp);
  });

  it('respects the per-enemy hit cooldown', () => {
    const w = new World({ seed: 3, noSpawn: true });
    const e = w.spawnEnemy('brute', 0, 0)!; // plenty of hp, so no kill
    e.hp = e.maxHp = 1e9;
    e.x = e.px = 90; e.y = e.py = 0;
    const hits: number[] = [];
    for (let i = 0; i < 90; i++) {
      // pin the orb on the enemy at high speed every step (ship far enough to be safe via god-less distance)
      w.orb.x = w.orb.px = e.x - 5; w.orb.y = w.orb.py = e.y;
      w.orb.vx = 800; w.orb.vy = 0;
      e.vx = e.vy = e.kx = e.ky = 0;
      w.step(idle());
      for (const ev of w.drainEvents()) if (ev.type === 'hit') hits.push(i);
    }
    expect(hits.length).toBeGreaterThan(5);
    for (let k = 1; k < hits.length; k++) expect((hits[k] - hits[k - 1]) / 60).toBeGreaterThanOrEqual(TUNING.hitCooldown - 1e-9);
  });

  it('crits at crit speed', () => {
    const w = new World({ seed: 4, noSpawn: true });
    const e = w.spawnEnemy('brute', 0, 0)!;
    e.x = e.px = 90; e.y = e.py = 0;
    w.orb.x = w.orb.px = 85; w.orb.y = w.orb.py = 0; w.orb.vx = 1300; w.orb.vy = 0;
    w.step(idle());
    const ev = w.drainEvents().find((x) => x.type === 'crit');
    expect(ev).toBeTruthy();
  });
});

describe('determinism', () => {
  const run = (seed: number, steps: number) => {
    const w = new World({ seed, god: true });
    for (let t = 0; t < steps; t++) w.step(scripted(t));
    return w;
  };
  it('same seed + same intents => same hash after 3600 steps', () => {
    const a = run(1234, 3600), b = run(1234, 3600);
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.kills).toBe(b.kills);
    expect(run(1235, 3600).stateHash()).not.toBe(a.stateHash());
  });
  it('restart on death is instant and clean', () => {
    const w = new World({ seed: 5, noSpawn: true });
    w.ship.hearts = 1; w.spawnEnemy('mite', 5, 0);
    w.step(idle());
    expect(w.dead).toBe(true);
    for (let i = 0; i < 30; i++) w.step({ ...idle(), confirm: true });
    expect(w.dead).toBe(false);
    expect(w.ship.hearts).toBe(TUNING.hearts);
  });
});
