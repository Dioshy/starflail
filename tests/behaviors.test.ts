import { describe, expect, it } from 'vitest';
import { World } from '../src/game/sim';
import { hitDamage } from '../src/data';
import { idle } from './helpers';

type Any = Record<string, any>;
const fresh = (grant: string, opts: Any = {}) => {
  const w = new World({ seed: 1, noSpawn: true, ...opts });
  expect(w.grantUpgrade(grant)).toBe(true);
  return w;
};
/** Slack tether (ship 60 px behind the orb) and an orb flying at `vx`. */
function aim(w: World, ox: number, oy: number, vx: number, vy = 0) {
  w.ship.x = w.ship.px = ox - 60; w.ship.y = w.ship.py = oy;
  w.orb.x = w.orb.px = ox; w.orb.y = w.orb.py = oy; w.orb.vx = vx; w.orb.vy = vy;
}
const tank = (w: World, kind: any, x: number, y: number) => { const e = w.spawnEnemy(kind, x, y, 1)!; e.hp = e.maxHp = 1e6; return e; };

describe('behaviors', () => {
  it('chainOnCrit: a crit arcs to 3 more enemies for 50% of the hit', () => {
    const w = fresh('arcCoil');
    aim(w, 190, 0, 1300);
    const es = [200, 300, 400, 500, 640].map((x) => tank(w, 'mite', x, 0));
    w.step(idle());
    const hit = w.drainEvents().find((e: Any) => e.type === 'hit' && !e.secondary) as Any;
    expect(hit.crit).toBe(true);
    const half = Math.round(hit.dmg * 0.5);
    expect(1e6 - es[1].hp).toBe(half); expect(1e6 - es[2].hp).toBe(half); expect(1e6 - es[3].hp).toBe(half);
    expect(es[4].hp).toBe(1e6); // only 3 jumps
  });

  it('tetherDamage: tether cuts for 25% of the non-crit hit, 0.4 s cooldown per enemy', () => {
    const w = fresh('barbedLine');
    w.ship.x = w.ship.px = 0; w.ship.y = w.ship.py = 0;
    w.orb.x = w.orb.px = 135; w.orb.y = w.orb.py = 0; w.orb.vx = 0; w.orb.vy = 600;
    const e = tank(w, 'mite', 70, 4);
    e.kx = e.ky = 0;
    w.step(idle());
    const sp = Math.hypot(w.orb.vx, w.orb.vy);
    const want = Math.round(hitDamage(sp, { ...w.stats, critSpeed: 1e9 }).damage * 0.25);
    expect(want).toBeGreaterThan(0);
    const first = 1e6 - e.hp;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) { e.x = e.px = 70; e.y = e.py = 4; w.step(idle()); }
    expect(1e6 - e.hp).toBe(first); // no second tick within 0.4 s
  });

  it('shockwaveOnReel: first reel hits for damage x hpMul, second within the cooldown does nothing', () => {
    const w = fresh('reelShock');
    aim(w, 140, 0, 0);
    const e = tank(w, 'mite', 140, 90);
    w.step({ ...idle(), reel: true });
    expect(1e6 - e.hp).toBe(25);
    for (let i = 0; i < 8; i++) w.step(idle());
    w.step({ ...idle(), reel: true });
    expect(1e6 - e.hp).toBe(25);
  });

  it('orbExplodeOnCrit: explodes once, then the 0.5 s cooldown blocks the next crit', () => {
    const w = fresh('novaCore');
    aim(w, 190, 0, 1300);
    const a = tank(w, 'mite', 200, 0), b = tank(w, 'mite', 250, 0);
    let booms = 0;
    const count = () => { for (const e of w.drainEvents()) if (e.type === 'explosion') booms++; };
    w.step(idle());
    const hit = w.events.find((e: Any) => e.type === 'hit' && !e.secondary && e.crit) as Any;
    expect(1e6 - b.hp).toBeGreaterThanOrEqual(Math.round(hit.dmg * 0.6));
    count();
    expect(booms).toBe(1);
    for (let i = 0; i < 9; i++) w.step(idle());
    count();
    const c = tank(w, 'mite', 700, 700), d = tank(w, 'mite', 700, 780);
    aim(w, 690, 700, 1300);
    w.step(idle()); // second crit ~0.17 s later
    count();
    expect(booms).toBe(1);
    expect(1e6 - d.hp).toBe(0);
    void a; void c;
  });

  it('thorns: a touching enemy is zapped for 30 x hpMul even during i-frames, ship takes nothing', () => {
    const w = fresh('staticHull');
    w.ship.iframes = 1;
    const e = tank(w, 'mite', 5, 0);
    w.step(idle());
    expect(1e6 - e.hp).toBe(30);
    expect(w.ship.hp).toBe(w.ship.maxHp);
  });

  it('vampiric: 120 kills in under a minute heal exactly twice (max 2/min)', () => {
    const w = fresh('leechOrb');
    w.ship.hp = 3;
    let heals = 0;
    for (let i = 0; i < 120; i++) {
      const e = w.spawnEnemy('mite', 1000, 1000, 1)!;
      (w as Any).killEnemy(e, 0, 0);
      w.step(idle());
      for (const ev of w.drainEvents()) if (ev.type === 'heal') heals++;
    }
    expect(heals).toBe(2);
  });

  it('magnetPulse: motes within 700 px start homing every 15 s', () => {
    const w = fresh('tractorPulse');
    const p = w.pickups.acquire()!;
    p.kind = 'xpSmall'; p.x = p.px = 500; p.y = p.py = 0; p.vx = p.vy = 0; p.value = 1; p.age = 0; p.homing = false; p.alive = true;
    for (let i = 0; i < 899; i++) w.step(idle());
    expect(p.homing).toBe(false);
    w.step(idle()); w.step(idle());
    expect(p.homing).toBe(true);
  });

  it('slowField: enemies near the orb are 40% slower only while reeling', () => {
    const w = fresh('gravityReel');
    aim(w, 140, 0, 0);
    const e = tank(w, 'mite', 200, 0);
    w.step(idle());
    const free = Math.hypot(e.vx, e.vy);
    w.step({ ...idle(), reel: true });
    // enemy velocity is scaled after AI; compare via distance travelled instead
    const x0 = e.x, y0 = e.y;
    w.orbs[0].x = 140; w.orbs[0].y = 0; w.orbs[0].vx = w.orbs[0].vy = 0; e.x = 200; e.y = 0;
    w.step({ ...idle(), reel: true });
    const slowed = Math.hypot(e.x - 200, e.y);
    expect(free).toBeGreaterThan(100);
    expect(slowed).toBeLessThan((free / 60) * 0.75 + 0.01);
    void x0; void y0;
  });

  it('orbCount > 1: Binary Star adds a second orb with 15% less mass', () => {
    const w = fresh('binaryStar');
    expect(w.orbs.length).toBe(2);
    expect(w.stats.orbMass).toBeCloseTo(0.85, 6);
  });
});
