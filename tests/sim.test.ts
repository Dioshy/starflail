import { describe, expect, it } from 'vitest';
import { World } from '../src/game/sim';
import { BASE_STATS, PHYSICS, hitDamage } from '../src/data';
import { idle, randomIntents, scripted } from './helpers';

const L = BASE_STATS.tetherLength;

describe('tether', () => {
  it('never exceeds the hard max length over 10k random steps', () => {
    const w = new World({ seed: 7, god: true });
    const next = randomIntents(99);
    let worst = 0;
    for (let i = 0; i < 10000; i++) {
      w.step(next());
      for (const o of w.orbs) {
        const d = Math.hypot(o.x - w.ship.x, o.y - w.ship.y);
        worst = Math.max(worst, d);
        expect(d).toBeLessThanOrEqual(w.tether.maxLen + 1e-6);
      }
    }
    expect(worst).toBeGreaterThan(L * 0.9);
  });

  const ang = (w: World) => {
    const o = w.orb, rx = o.x - w.ship.x, ry = o.y - w.ship.y;
    const h = rx * o.vy - ry * o.vx;
    return { h, omega: h / (rx * rx + ry * ry), r: Math.hypot(rx, ry) };
  };

  it('reel to 0.5x length gives >=3x angular speed with L conserved within 10% (drag off, ship still)', () => {
    const w = new World({ seed: 1, noSpawn: true, physics: { orbDrag: 0, heldReelExtraDamping: 0 } });
    w.orb.x = w.orb.px = L; w.orb.y = w.orb.py = 0; w.orb.vx = 0; w.orb.vy = 300;
    const before = ang(w);
    for (let i = 0; i < 30; i++) {
      w.step({ ...idle(), reel: true });
      expect(Math.abs(ang(w).h - before.h) / before.h).toBeLessThan(0.1);
    }
    expect(ang(w).omega / before.omega).toBeGreaterThanOrEqual(3);
  });

  it('a carried orb is not slowed by drag (relative drag)', () => {
    const w = new World({ seed: 1, noSpawn: true });
    w.ship.x = w.ship.px = -1400; w.orb.x = w.orb.px = -1260; // start far from the wall so it never clips
    for (let i = 0; i < 330; i++) w.step({ ...idle(), moveX: 1 });
    const rel = Math.hypot(w.orb.vx - w.ship.vx, w.orb.vy - w.ship.vy);
    expect(rel).toBeLessThan(5);
  });

  it('orbCount 3 gives nested rest lengths L, 0.8L, 0.6L', () => {
    const w = new World({ seed: 1, noSpawn: true });
    w.mods.push({ stat: 'orbCount', op: 'add', value: 2 });
    (w as unknown as { recomputeStats(): void }).recomputeStats();
    expect(w.orbs.length).toBe(3);
    for (let i = 0; i < 60; i++) w.step(idle());
    const d = w.orbs.map((o) => Math.hypot(o.x - w.ship.x, o.y - w.ship.y));
    expect(d[0]).toBeCloseTo(L, 0); expect(d[1]).toBeCloseTo(L * 0.8, 0); expect(d[2]).toBeCloseTo(L * 0.6, 0);
  });

  it('orb speed is clamped to maxOrbSpeed', () => {
    const w = new World({ seed: 1, noSpawn: true });
    w.orb.vx = 5000;
    w.step(idle());
    expect(w.orbSpeed()).toBeLessThanOrEqual(PHYSICS.maxOrbSpeed + 1e-6);
  });
});

describe('damage', () => {
  it('bumps (0 damage) below minDamageSpeed, damages above', () => {
    const w = new World({ seed: 2, noSpawn: true });
    const e = w.spawnEnemy('mite', 200, 0)!;
    const hp = e.hp;
    w.orb.x = w.orb.px = 190; w.orb.y = w.orb.py = 0; w.orb.vx = 100; w.orb.vy = 0;
    w.step(idle());
    expect(e.hp).toBe(hp);
    expect(w.drainEvents().some((ev) => ev.type === 'hit' && ev.bump)).toBe(true);
  });

  it('matches hitDamage() for a ~1000 px/s crit', () => {
    const w = new World({ seed: 3, noSpawn: true });
    const e = w.spawnEnemy('brute', 400, 0, 1)!;
    const hp = e.hp;
    w.ship.x = w.ship.px = 300; // keep the tether slack so the orb keeps speed
    w.orb.x = w.orb.px = 385; w.orb.y = w.orb.py = 0; w.orb.vx = 1000; w.orb.vy = 0;
    w.step(idle());
    const ev = w.drainEvents().find((x) => x.type === 'hit');
    expect(ev && ev.type === 'hit' && ev.crit).toBe(true);
    const speed = ev && ev.type === 'hit' ? ev.speed : 0;
    expect(hp - e.hp).toBe(hitDamage(speed, w.stats, { armorSpeed: 450, armorDamageMul: 0.25 }).damage);
  });

  it('respects the per-pair hit cooldown', () => {
    const w = new World({ seed: 3, noSpawn: true });
    const e = w.spawnEnemy('warden', 0, 0)!;
    e.hp = e.maxHp = 1e9; e.x = e.px = 90; e.y = e.py = 0;
    const hits: number[] = [];
    for (let i = 0; i < 90; i++) {
      w.orb.x = w.orb.px = e.x - 5; w.orb.y = w.orb.py = e.y; w.orb.vx = 800; w.orb.vy = 0;
      w.ship.x = w.ship.px = e.x - 100; w.ship.y = w.ship.py = 0;
      w.step(idle());
      for (const ev of w.drainEvents()) if (ev.type === 'hit') hits.push(i);
    }
    expect(hits.length).toBeGreaterThan(5);
    for (let k = 1; k < hits.length; k++) expect((hits[k] - hits[k - 1]) / 60).toBeGreaterThanOrEqual(PHYSICS.hitCooldownSec - 1e-9);
  });
});

describe('health', () => {
  it('largest damage source wins, i-frames then block the rest', () => {
    const w = new World({ seed: 5, noSpawn: true });
    w.spawnEnemy('mite', 5, 0); w.spawnEnemy('brute', -5, 0);
    w.step(idle());
    expect(w.ship.hp).toBe(w.ship.maxHp - 2);
    w.step(idle());
    expect(w.ship.hp).toBe(w.ship.maxHp - 2);
  });

  it('death ends the run and names the killer', () => {
    const w = new World({ seed: 5, noSpawn: true });
    w.ship.hp = 1; w.spawnEnemy('mite', 5, 0);
    w.step(idle());
    expect(w.outcome).toBe('dead');
    expect(w.killedBy).toBe('Mite');
  });
});

describe('determinism', () => {
  const run = (seed: number, steps: number) => {
    const w = new World({ seed, god: true, autoDraft: true });
    for (let t = 0; t < steps; t++) w.step(scripted(t));
    return w;
  };
  it('same seed + same intents => same hash after 3600 steps (and a different seed differs)', () => {
    const a = run(1234, 3600), b = run(1234, 3600);
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.kills).toBe(b.kills);
    expect(run(1235, 3600).stateHash()).not.toBe(a.stateHash());
  });
  it('sim is frame-rate independent by construction: it only ever advances in fixed ticks', () => {
    const a = run(9, 1200), b = run(9, 1200);
    expect(a.time).toBeCloseTo(20, 6);
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
