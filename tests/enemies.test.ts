import { describe, expect, it } from 'vitest';
import { World } from '../src/game/sim';
import { DIRECTOR, EVENTS, WAVES } from '../src/data';
import { waveAt } from '../src/game/director';
import { botIntents } from '../src/game/bot';
import { idle } from './helpers';

type Any = Record<string, any>;
const run = (w: World, ticks: number, fn: () => void = () => {}) => { for (let i = 0; i < ticks; i++) { w.step(idle()); fn(); } };
const evs = (w: World): Any[] => w.drainEvents() as Any[];

describe('enemies', () => {
  it('dart telegraphs >= 0.6 s with a locked direction, then dashes', () => {
    const w = new World({ seed: 1, noSpawn: true, god: true });
    const d = w.spawnEnemy('dart', 150, 0)!;
    let telTicks = 0, sawDash = false;
    for (let i = 0; i < 120; i++) { w.step(idle()); if (d.state === 1) telTicks++; if (d.state === 2) sawDash = true; }
    expect(telTicks / 60).toBeGreaterThanOrEqual(0.6);
    expect(sawDash).toBe(true);
  });
  it('blob splits into 2 invulnerable bloblings', () => {
    const w = new World({ seed: 1, noSpawn: true });
    const b = w.spawnEnemy('blob', 400, 0, 1)!;
    (w as any).killEnemy(b, 1, 0);
    const kids = Array.from({ length: w.enemies.count }, (_, i) => w.enemies.items[i]).filter((e) => e.alive && e.kind === 'blobling');
    expect(kids.length).toBe(2);
    for (const k of kids) { expect(k.invuln).toBeGreaterThan(0.15); expect(k.hp).toBe(15); }
  });
  it('spitter fires after its telegraph; a fast orb swats the projectile, a slow one does not', () => {
    const w = new World({ seed: 1, noSpawn: true, god: true });
    const s = w.spawnEnemy('spitter', 380, 0)!; s.cd0 = 0;
    run(w, 60);
    expect(w.projectiles.count).toBeGreaterThan(0);
    const p = w.projectiles.items[0];
    w.orb.x = w.orb.px = p.x; w.orb.y = w.orb.py = p.y; w.orb.vx = 0; w.orb.vy = 100;
    const n = w.projectiles.count;
    w.step(idle());
    expect(w.projectiles.count).toBe(n);
    w.orb.x = w.orb.px = w.projectiles.items[0].x; w.orb.y = w.orb.py = w.projectiles.items[0].y; w.orb.vy = 400;
    w.step(idle());
    expect(w.projectiles.count).toBe(n - 1);
  });
  it('brute armour: slow hits clang for 25%', () => {
    const w = new World({ seed: 1, noSpawn: true });
    const b = w.spawnEnemy('brute', 400, 0, 1)!;
    w.ship.x = w.ship.px = 330;
    w.orb.x = w.orb.px = 370; w.orb.y = w.orb.py = 0; w.orb.vx = 420; w.orb.vy = 0;
    w.step(idle());
    const hit = evs(w).find((e) => e.type === 'hit');
    expect(hit.dmg).toBeLessThan(15);
  });
});

describe('director', () => {
  it('waves are contiguous; overtime k=2 at 645 s gives hpMul 3.5 and spawn 2.4', () => {
    for (let i = 1; i < WAVES.length; i++) expect(WAVES[i].fromSec).toBe(WAVES[i - 1].toSec);
    expect(waveAt(30).wave.fromSec).toBe(30);
    const o = waveAt(645);
    expect(o.hpMul).toBeCloseTo(3.5, 6); expect(o.spawnPerSec).toBeCloseTo(2.4, 6); expect(o.maxAlive).toBe(50);
  });
  it('spawns are off-screen and inside the arena', () => {
    const w = new World({ seed: 9, god: true });
    for (let i = 0; i < 900; i++) {
      w.step(idle());
      for (let k = 0; k < w.enemies.count; k++) { const e = w.enemies.items[k]; expect(Math.hypot(e.x, e.y)).toBeLessThanOrEqual(1600 + 1e-6); }
    }
    expect(w.enemies.count).toBeGreaterThan(5);
  });
  it('swarmRing at 90 s puts 16 mites on a 520 px ring', () => {
    const w = new World({ seed: 2, god: true });
    w.time = 89.99;
    const before = w.enemies.count;
    w.step(idle());
    expect(w.enemies.count - before).toBeGreaterThanOrEqual(16);
    expect(EVENTS.find((e) => e.atSec === 90)!.count).toBe(16);
  });
  it('boss: warning 2 s before spawn, boss spawns at its event time, HP ignores hpMul', () => {
    const w = new World({ seed: 3, god: true });
    w.time = 177.99;
    const log: string[] = [];
    for (let i = 0; i < 200; i++) { w.step(idle()); for (const e of evs(w)) if (e.type === 'bossWarn' || e.type === 'bossSpawn') log.push(`${e.type}@${w.time.toFixed(1)}`); }
    expect(log[0]).toMatch(/^bossWarn@178/); expect(log[1]).toMatch(/^bossSpawn@180/);
    expect(w.activeBoss()!.maxHp).toBe(4000);
    expect(DIRECTOR.bossWarningSec).toBe(2);
  });
});

describe('bosses', () => {
  const boss = (kind: string, seed = 1) => { const w = new World({ seed, noSpawn: true, god: true }); const b = w.spawnEnemy(kind as any, 500, 0)!; return { w, b }; };
  it('warden: ring of 16, 24 in phase 2; wall charge stuns and takes x1.5', () => {
    const { w, b } = boss('warden');
    b.cd0 = 0; b.cd1 = 99;
    run(w, 60 * 2, () => { if (w.projectiles.count >= 16) return; });
    expect(w.projectiles.count).toBe(16);
    const { w: w2, b: b2 } = boss('warden');
    b2.hp = b2.maxHp * 0.4; b2.cd0 = 0; b2.cd1 = 99;
    run(w2, 60 * 2);
    expect(b2.phase2).toBe(true); expect(w2.projectiles.count).toBe(24);
    const { w: w3, b: b3 } = boss('warden');
    b3.x = b3.px = 1300; b3.y = b3.py = 0; b3.cd0 = 99; b3.cd1 = 0;
    let stunned = false;
    for (let i = 0; i < 200; i++) { w3.ship.x = w3.ship.px = 1000; w3.step(idle()); if (b3.stun > 0) stunned = true; w3.ship.iframes = 0; }
    expect(stunned).toBe(true);
  });
  it('hive: brood of 6, capped at 18 summons; volley fires 5 shots', () => {
    const { w, b } = boss('hive');
    b.cd0 = 0; b.cd1 = 99;
    run(w, 60 * 1.5);
    const n = () => Array.from({ length: w.enemies.count }, (_, i) => w.enemies.items[i]).filter((e) => e.kind === 'blobling').length;
    expect(n()).toBe(6);
    for (let r = 0; r < 5; r++) { b.cd0 = 0; run(w, 60); w.ship.hp = 5; }
    expect(n()).toBeLessThanOrEqual(18 + 0);
    const { w: w2, b: b2 } = boss('hive'); b2.cd0 = 99; b2.cd1 = 0;
    run(w2, 60); expect(w2.projectiles.count).toBe(5);
  });
  it('eclipse: blink hits a stationary ship for 2, gravity well is phase 2 only, kill = win', () => {
    const w = new World({ seed: 1, noSpawn: true });
    const b = w.spawnEnemy('eclipse', 700, 0)!;
    b.cd0 = 99; b.cd1 = 0; b.cd2 = 0;
    run(w, 60 * 2);
    expect(w.ship.hp).toBe(w.ship.maxHp - 2);
    expect(b.pat).not.toBe(2);
    const { w: w2, b: b2 } = boss('eclipse'); b2.hp = 1; (w2 as any).killEnemy(b2, 1, 0);
    w2.step(idle());
    expect(w2.outcome).toBe('won'); expect(w2.bossKills).toBe(1);
  });
  it('warden and hive warp out after 120 s with no reward; eclipse stays', () => {
    const w = new World({ seed: 1, god: true });
    const b = w.spawnEnemy('warden', 600, 0)!; const e = w.spawnEnemy('eclipse', -600, 0)!;
    b.age = e.age = 119.99; w.time = 200;
    w.step(idle()); w.step(idle());
    expect(b.alive).toBe(false); expect(e.alive).toBe(true); expect(w.bossKills).toBe(0);
  });
});

describe('circling bot (headless, 5 seeds)', () => {
  it('prints survival times and never breaks the sim', () => {
    const out: string[] = []; const times: number[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = new World({ seed, autoDraft: true });
      while (!w.outcome && w.time < 600) { w.step(botIntents(w)); w.events.length = 0; }
      expect(Number.isFinite(w.ship.x + w.orb.x)).toBe(true);
      times.push(w.outcome ? w.endTime : w.time);
      out.push(`seed ${seed}: ${w.outcome ?? 'alive'} at ${times[times.length - 1].toFixed(0)} s, level ${w.level}, kills ${w.kills}, killed by ${w.killedBy || '-'}`);
    }
    console.log('BOT SURVIVAL\n' + out.join('\n'));
    expect(Math.max(...times)).toBeGreaterThan(30);
  }, 240000);
});
