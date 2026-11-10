import { Pool } from '../core/pool';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import type { Intents } from '../core/input';
import { STEP } from '../core/loop';
import { TUNING, type EnemyTuning, type Tuning } from './tuning';
import type { Enemy, EnemyKind, GameEvent, Mote } from './types';

export interface WorldOptions {
  seed: number;
  god?: boolean;
  noSpawn?: boolean;
  /** keep N enemies alive at all times (stress test) */
  stress?: number;
  tuning?: Tuning;
}

const MAX_ENEMIES = 512;
const MAX_MOTES = 900;

// dart states
const D_APPROACH = 0, D_TELEGRAPH = 1, D_DASH = 2, D_RECOVER = 3;

/** Damage formula (pure, exported for tests and UI). */
export function computeDamage(relSpeed: number, T: Tuning, dmgMult = 1): number {
  return Math.max(0, relSpeed - T.minDamageSpeed) * T.damagePerSpeed * T.orbMass * dmgMult;
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

export class World {
  readonly T: Tuning;
  seed: number;
  rng: Rng;
  tick = 0;
  time = 0;
  runIndex = 0;
  god: boolean;
  noSpawn: boolean;
  stress: number;

  ship = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, hearts: 5, iframes: 0, radius: 14, aim: 0 };
  orb = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, radius: 16 };
  tether = { rest: 140, reelT: 0, maxLen: 224 };

  enemies: Pool<Enemy>;
  motes: Pool<Mote>;
  events: GameEvent[] = [];

  level = 1;
  xp = 0;
  xpNext = 5;
  dmgMult = 1;
  kills = 0;
  dead = false;
  deadTime = 0;
  hitCount = 0;

  private nextId = 1;
  private spawnAcc = 0;
  private hash = new SpatialHash(64, 1700, MAX_ENEMIES);
  private tmp: number[] = [];
  private knockDecay: number;

  constructor(opts: WorldOptions) {
    this.T = opts.tuning ?? TUNING;
    this.seed = opts.seed >>> 0;
    this.rng = new Rng(this.seed);
    this.god = !!opts.god;
    this.noSpawn = !!opts.noSpawn;
    this.stress = opts.stress ?? 0;
    this.knockDecay = Math.exp(-this.T.knockDrag * STEP);
    const mkEnemy = (): Enemy => ({
      id: 0, kind: 'mite', x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, kx: 0, ky: 0, hp: 0, maxHp: 0, radius: 0, mass: 1,
      state: 0, timer: 0, dirX: 0, dirY: 0, hitCd: 0, flash: 0, alive: false,
    });
    const mkMote = (): Mote => ({ x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, value: 1, age: 0, alive: false });
    this.enemies = new Pool(MAX_ENEMIES, mkEnemy);
    this.motes = new Pool(MAX_MOTES, mkMote);
    this.restart(this.seed);
  }

  /** Instantly starts a fresh run (used on death + confirm). */
  restart(seed: number): void {
    const T = this.T;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.tick = 0; this.time = 0;
    this.enemies.clear(); this.motes.clear(); this.events.length = 0;
    this.level = 1; this.xp = 0; this.xpNext = T.xpBase; this.dmgMult = 1; this.kills = 0;
    this.dead = false; this.deadTime = 0; this.hitCount = 0; this.nextId = 1; this.spawnAcc = 0;
    const s = this.ship;
    s.x = s.px = 0; s.y = s.py = 0; s.vx = s.vy = 0; s.hearts = T.hearts; s.iframes = 0; s.radius = T.shipRadius; s.aim = 0;
    const o = this.orb;
    o.x = o.px = T.tetherLength; o.y = o.py = 0; o.vx = 0; o.vy = 0; o.radius = T.orbRadius;
    this.tether.rest = T.tetherLength; this.tether.reelT = 0; this.tether.maxLen = T.tetherLength * T.maxStretch;
    if (this.stress > 0 && !this.noSpawn) {
      for (let i = 0; i < this.stress; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const d = Math.sqrt(this.rng.range(0.04, 0.8)) * T.arenaRadius;
        this.spawnEnemy(this.pickKind(), Math.cos(a) * d, Math.sin(a) * d);
      }
    }
  }

  step(i: Intents): void {
    const T = this.T;
    const dt = STEP;
    const s = this.ship, o = this.orb;
    s.px = s.x; s.py = s.y; o.px = o.x; o.py = o.y;
    const en = this.enemies.items;
    for (let k = 0; k < this.enemies.count; k++) { en[k].px = en[k].x; en[k].py = en[k].y; }
    const mo = this.motes.items;
    for (let k = 0; k < this.motes.count; k++) { mo[k].px = mo[k].x; mo[k].py = mo[k].y; }

    if (this.dead) {
      this.deadTime += dt;
      for (let k = 0; k < this.enemies.count; k++) if (en[k].flash > 0) en[k].flash -= dt;
      if (i.confirm && this.deadTime >= T.deathLockout) {
        this.runIndex++;
        this.restart((this.seed * 1664525 + 1013904223 + this.runIndex) >>> 0);
      }
      return;
    }

    this.stepShip(i, dt);
    this.stepOrb(i.reel, dt);
    this.stepEnemies(dt);
    this.stepHits(dt);
    this.stepContact(dt);
    this.stepMotes(dt);
    this.compact();
    this.stepSpawner(dt);
    this.tick++;
    this.time += dt;
  }

  // ---------------------------------------------------------------- ship
  private stepShip(i: Intents, dt: number): void {
    const T = this.T, s = this.ship;
    let mx = i.moveX, my = i.moveY;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const tx = mx * T.shipSpeed, ty = my * T.shipSpeed;
    let dx = tx - s.vx, dy = ty - s.vy;
    const dl = Math.hypot(dx, dy), maxd = T.shipAccel * dt;
    if (dl > maxd) { dx *= maxd / dl; dy *= maxd / dl; }
    s.vx += dx; s.vy += dy;
    if (m > 0.1) s.aim = Math.atan2(my, mx);
    // soft wall
    const d = Math.hypot(s.x, s.y), edge = T.arenaRadius - T.wallSoft;
    if (d > edge) {
      const push = ((d - edge) / T.wallSoft) * T.wallPush * dt;
      s.vx -= (s.x / d) * push; s.vy -= (s.y / d) * push;
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    const lim = T.arenaRadius - s.radius, d2 = Math.hypot(s.x, s.y);
    if (d2 > lim) {
      const nx = s.x / d2, ny = s.y / d2;
      s.x = nx * lim; s.y = ny * lim;
      const vn = s.vx * nx + s.vy * ny;
      if (vn > 0) { s.vx -= nx * vn; s.vy -= ny * vn; }
    }
    if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
  }

  // ---------------------------------------------------------------- orb
  private stepOrb(reel: boolean, dt: number): void {
    const T = this.T, s = this.ship, o = this.orb, th = this.tether;
    const prevT = th.reelT;
    th.reelT = Math.min(1, Math.max(0, th.reelT + (reel ? dt / T.reelTime : -dt / T.releaseTime)));
    th.rest = T.tetherLength * (1 - (1 - T.reelRatio) * th.reelT);
    const transitioning = th.reelT !== prevT;
    // Kinematic reel-in: while the rest length shrinks, project the orb onto the smaller radius and scale its
    // tangential velocity (relative to the ship) by r_old / r_new, so r*v_t (angular momentum) is conserved.
    // The spring is NOT relied on to pull the orb in.
    if (th.reelT > prevT) {
      const restOld = T.tetherLength * (1 - (1 - T.reelRatio) * prevT);
      const rx = o.x - s.x, ry = o.y - s.y, L = Math.hypot(rx, ry);
      if (L > th.rest && L > 8) {
        const rNew = Math.max(th.rest, L * (th.rest / restOld));
        const nx = rx / L, ny = ry / L;
        const rvx = o.vx - s.vx, rvy = o.vy - s.vy;
        const vt = nx * rvy - ny * rvx;
        const vtNew = vt * (L / rNew);
        o.x = s.x + nx * rNew; o.y = s.y + ny * rNew;
        // radial rel. velocity is zeroed (the projection already moved the orb inward); tangential is scaled
        o.vx = s.vx - ny * vtNew; o.vy = s.vy + nx * vtNew;
      }
    }
    const SUB = 2, h = dt / SUB;
    for (let n = 0; n < SUB; n++) {
      let rx = o.x - s.x, ry = o.y - s.y;
      let L = Math.hypot(rx, ry);
      let rvx = o.vx - s.vx, rvy = o.vy - s.vy;
      const drag = 1 - T.orbDrag * h;
      const hTarget = (rx * rvy - ry * rvx) * drag; // angular momentum (per unit mass) after drag
      if (L > 1e-6) {
        const nx = rx / L, ny = ry / L;
        if (L > th.rest) {
          const radV = rvx * nx + rvy * ny;
          const pull = Math.max(0, T.stiffness * (L - th.rest) + T.damping * radV);
          o.vx -= nx * pull * h; o.vy -= ny * pull * h;
        }
      }
      o.vx *= drag; o.vy *= drag;
      o.x += o.vx * h; o.y += o.vy * h;
      // HARD max length
      rx = o.x - s.x; ry = o.y - s.y; L = Math.hypot(rx, ry);
      if (L > th.maxLen) {
        const nx = rx / L, ny = ry / L;
        o.x = s.x + nx * th.maxLen; o.y = s.y + ny * th.maxLen; L = th.maxLen;
        const vr = (o.vx - s.vx) * nx + (o.vy - s.vy) * ny;
        if (vr > 0) { o.vx -= nx * vr; o.vy -= ny * vr; }
      }
      // fully reeled and held: the short tether is a rigid kinematic rope (strip only the outward radial velocity,
      // keep the tangential speed), so the fast spin doesn't fling the orb back out through the weak spring
      if (reel && th.reelT >= 1 && L > th.rest) {
        const nx = rx / L, ny = ry / L;
        o.x = s.x + nx * th.rest; o.y = s.y + ny * th.rest; L = th.rest;
        const vr = (o.vx - s.vx) * nx + (o.vy - s.vy) * ny;
        if (vr > 0) { o.vx -= nx * vr; o.vy -= ny * vr; }
      }
      // conserve angular momentum while the rest length is changing
      if (transitioning && L > 8) {
        const nx = (o.x - s.x) / L, ny = (o.y - s.y) / L;
        rvx = o.vx - s.vx; rvy = o.vy - s.vy;
        const vt = nx * rvy - ny * rvx;
        const want = hTarget / L;
        o.vx += -ny * (want - vt); o.vy += nx * (want - vt);
      }
      const sp = Math.hypot(o.vx, o.vy);
      if (sp > T.maxOrbSpeed) { o.vx *= T.maxOrbSpeed / sp; o.vy *= T.maxOrbSpeed / sp; }
      const od = Math.hypot(o.x, o.y), olim = T.arenaRadius - o.radius;
      if (od > olim) {
        const nx = o.x / od, ny = o.y / od;
        o.x = nx * olim; o.y = ny * olim;
        const vn = o.vx * nx + o.vy * ny;
        if (vn > 0) { o.vx -= nx * vn * 1.6; o.vy -= ny * vn * 1.6; } // bounce off the wall
      }
    }
  }

  // ---------------------------------------------------------------- enemies
  private defOf(kind: EnemyKind): EnemyTuning { return this.T[kind]; }

  private pickKind(): EnemyKind {
    const sp = this.T.spawn, t = this.time, r = this.rng.next(); // always one draw
    if (this.stress > 0) return r < 0.7 ? 'mite' : r < 0.9 ? 'dart' : 'brute';
    if (t >= sp.bruteFrom && r < 0.07) return 'brute';
    if (t >= sp.dartFrom && r < 0.07 + Math.min(0.3, 0.1 + (t - sp.dartFrom) * 0.002)) return 'dart';
    return 'mite';
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy | null {
    const e = this.enemies.acquire();
    if (!e) return null;
    const d = this.defOf(kind);
    e.id = this.nextId++; e.kind = kind;
    e.x = e.px = x; e.y = e.py = y; e.vx = e.vy = e.kx = e.ky = 0;
    e.hp = e.maxHp = d.hp; e.radius = d.radius; e.mass = d.mass;
    e.state = 0; e.timer = 0; e.dirX = e.dirY = 0; e.hitCd = 0; e.flash = 0; e.alive = true;
    return e;
  }

  private stepEnemies(dt: number): void {
    const T = this.T, s = this.ship, en = this.enemies.items, n = this.enemies.count;
    const kd = this.knockDecay;
    for (let k = 0; k < n; k++) {
      const e = en[k];
      if (e.hitCd > 0) e.hitCd -= dt;
      if (e.flash > 0) e.flash -= dt;
      let dx = s.x - e.x, dy = s.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      const d = this.defOf(e.kind);
      if (e.kind === 'dart') {
        switch (e.state) {
          case D_APPROACH:
            e.vx = dx * d.speed; e.vy = dy * d.speed;
            if (dist < T.dartTriggerRange) { e.state = D_TELEGRAPH; e.timer = T.dartTelegraph; e.dirX = dx; e.dirY = dy; }
            break;
          case D_TELEGRAPH:
            e.vx = e.vy = 0; e.timer -= dt;
            if (e.timer > T.dartLockBefore) { e.dirX = dx; e.dirY = dy; }
            if (e.timer <= 0) { e.state = D_DASH; e.timer = T.dartDashTime; }
            break;
          case D_DASH:
            e.vx = e.dirX * T.dartDashSpeed; e.vy = e.dirY * T.dartDashSpeed; e.timer -= dt;
            if (e.timer <= 0) { e.state = D_RECOVER; e.timer = T.dartRecover; }
            break;
          default:
            e.vx *= 0.9; e.vy *= 0.9; e.timer -= dt;
            if (e.timer <= 0) e.state = D_APPROACH;
        }
      } else {
        e.vx = dx * d.speed; e.vy = dy * d.speed;
      }
      e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
      e.kx *= kd; e.ky *= kd;
      const ed = Math.hypot(e.x, e.y);
      if (ed > T.arenaRadius) { e.x *= T.arenaRadius / ed; e.y *= T.arenaRadius / ed; }
    }
    // spatial hash + soft separation
    const h = this.hash; h.clear();
    for (let k = 0; k < n; k++) h.insert(en[k].x, en[k].y, en[k].radius);
    const tmp = this.tmp;
    for (let k = 0; k < n; k++) {
      const e = en[k];
      h.query(e.x, e.y, e.radius, tmp);
      for (let q = 0; q < tmp.length; q++) {
        const j = tmp[q];
        if (j === k) continue;
        const o2 = en[j];
        let dx = e.x - o2.x, dy = e.y - o2.y;
        const dd = Math.hypot(dx, dy), min = e.radius + o2.radius;
        if (dd >= min) continue;
        if (dd < 1e-4) { dx = 1; dy = 0; } else { dx /= dd; dy /= dd; }
        const push = (min - dd) * 0.25 * (o2.mass / (e.mass + o2.mass)) * 2;
        e.x += dx * push; e.y += dy * push;
      }
    }
  }

  // ---------------------------------------------------------------- orb vs enemies
  private stepHits(_dt: number): void {
    const T = this.T, o = this.orb, s = this.ship, en = this.enemies.items;
    const relOrbVx = o.vx, relOrbVy = o.vy;
    const orbSpeed = Math.hypot(relOrbVx, relOrbVy);
    if (orbSpeed < 1) return;
    const sx = o.px, sy = o.py, ex = o.x, ey = o.y;
    const sdx = ex - sx, sdy = ey - sy, seg2 = sdx * sdx + sdy * sdy;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    const qr = Math.sqrt(seg2) / 2 + o.radius + 10;
    const tmp = this.tmp;
    this.hash.query(mx, my, qr, tmp);
    // deterministic order
    if (tmp.length > 1) tmp.sort((a, b) => a - b);
    let slowed = 0;
    for (let q = 0; q < tmp.length; q++) {
      const e = en[tmp[q]];
      if (!e.alive || e.hitCd > 0) continue;
      // closest point on swept segment
      let t = seg2 > 1e-9 ? ((e.x - sx) * sdx + (e.y - sy) * sdy) / seg2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = sx + sdx * t, cy = sy + sdy * t;
      const dx = e.x - cx, dy = e.y - cy, rr = o.radius + e.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      const rel = Math.hypot(o.vx - (e.vx + e.kx), o.vy - (e.vy + e.ky));
      const dmg = computeDamage(rel, T, this.dmgMult);
      if (dmg <= 0) continue;
      const crit = rel >= T.critSpeed;
      const total = crit ? dmg * T.critMultiplier : dmg;
      e.hp -= total;
      e.hitCd = T.hitCooldown;
      e.flash = 0.09;
      const inv = 1 / (orbSpeed || 1);
      const nx = o.vx * inv, ny = o.vy * inv;
      const kb = (orbSpeed * T.knockback) / e.mass;
      e.kx += nx * kb; e.ky += ny * kb;
      this.hitCount++;
      this.events.push({ type: 'hit', x: e.x, y: e.y, nx, ny, dmg: total, crit, speed: rel, kind: e.kind });
      if (crit) this.events.push({ type: 'crit', x: e.x, y: e.y, dmg: total });
      slowed = Math.max(slowed, this.defOf(e.kind).orbSlow);
      if (e.hp <= 0) this.killEnemy(e);
    }
    if (slowed > 0) { o.vx *= 1 - slowed; o.vy *= 1 - slowed; }
    void s;
  }

  private killEnemy(e: Enemy): void {
    e.alive = false;
    this.kills++;
    this.events.push({ type: 'kill', x: e.x, y: e.y, kind: e.kind });
    const m = this.motes.acquire();
    const value = this.defOf(e.kind).xp;
    if (m) {
      m.x = m.px = e.x; m.y = m.py = e.y;
      m.vx = e.kx * 0.2; m.vy = e.ky * 0.2; m.value = value; m.age = 0; m.alive = true;
    } else this.addXp(value);
  }

  // ---------------------------------------------------------------- enemies vs ship
  private stepContact(_dt: number): void {
    const T = this.T, s = this.ship, en = this.enemies.items;
    for (let k = 0; k < this.enemies.count; k++) {
      const e = en[k];
      if (!e.alive) continue;
      const dx = s.x - e.x, dy = s.y - e.y, rr = s.radius + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = dx / d, ny = dy / d;
      e.kx -= nx * 260; e.ky -= ny * 260;
      if (s.iframes > 0 || this.god) continue;
      s.hearts--;
      s.iframes = T.iframes;
      s.vx += nx * 380; s.vy += ny * 380;
      this.events.push({ type: 'playerHurt', x: s.x, y: s.y, hearts: s.hearts });
      if (s.hearts <= 0) {
        this.dead = true; this.deadTime = 0;
        this.events.push({ type: 'death', x: s.x, y: s.y });
        return;
      }
    }
  }

  // ---------------------------------------------------------------- motes / xp
  private addXp(v: number): void {
    this.xp += v;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = this.T.xpBase + (this.level - 1) * this.T.xpPerLevel;
      this.dmgMult = 1 + this.T.levelDamageBonus * (this.level - 1);
      this.events.push({ type: 'levelUp', level: this.level });
    }
  }

  private stepMotes(dt: number): void {
    const T = this.T, s = this.ship, mo = this.motes.items;
    for (let k = 0; k < this.motes.count; k++) {
      const m = mo[k];
      m.age += dt;
      const dx = s.x - m.x, dy = s.y - m.y, d = Math.hypot(dx, dy) || 1;
      if (d < T.pickupRadius) {
        const sp = 220 + (1 - d / T.pickupRadius) * (T.moteMaxSpeed - 220);
        m.vx += (dx / d * sp - m.vx) * Math.min(1, 10 * dt);
        m.vy += (dy / d * sp - m.vy) * Math.min(1, 10 * dt);
      } else {
        m.vx *= 0.96; m.vy *= 0.96;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (d < s.radius + 8) {
        m.alive = false;
        this.events.push({ type: 'pickup', x: m.x, y: m.y });
        this.addXp(m.value);
      } else if (m.age > T.moteLife) m.alive = false;
    }
  }

  private compact(): void {
    for (let k = this.enemies.count - 1; k >= 0; k--) if (!this.enemies.items[k].alive) this.enemies.release(k);
    for (let k = this.motes.count - 1; k >= 0; k--) if (!this.motes.items[k].alive) this.motes.release(k);
  }

  // ---------------------------------------------------------------- spawner
  private stepSpawner(dt: number): void {
    if (this.noSpawn) return;
    const sp = this.T.spawn;
    const target = this.stress > 0 ? this.stress : Math.min(sp.cap, sp.baseTarget + sp.perSecond * this.time);
    if (this.enemies.count >= target) { this.spawnAcc = 0; return; }
    this.spawnAcc += dt * (this.stress > 0 ? sp.rate * 20 : sp.rate);
    while (this.spawnAcc >= 1 && this.enemies.count < target) {
      this.spawnAcc -= 1;
      const kind = this.pickKind();
      const s = this.ship;
      for (let tries = 0; tries < 8; tries++) {
        const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(sp.minDistance, sp.maxDistance);
        const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
        if (Math.hypot(x, y) <= this.T.arenaRadius - 30) { this.spawnEnemy(kind, x, y); break; }
      }
    }
  }

  // ---------------------------------------------------------------- hash
  stateHash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      f64[0] = v === 0 ? 0 : v; // canonicalise -0
      h = Math.imul(h ^ u32[0], 0x01000193);
      h = Math.imul(h ^ u32[1], 0x01000193);
    };
    const s = this.ship, o = this.orb, th = this.tether;
    mix(this.tick); mix(this.rng.state); mix(this.level); mix(this.xp); mix(this.kills); mix(this.dead ? 1 : 0);
    mix(s.x); mix(s.y); mix(s.vx); mix(s.vy); mix(s.hearts); mix(s.iframes);
    mix(o.x); mix(o.y); mix(o.vx); mix(o.vy); mix(th.rest); mix(th.reelT);
    const en = this.enemies.items;
    for (let k = 0; k < this.enemies.count; k++) {
      const e = en[k];
      mix(e.id); mix(e.x); mix(e.y); mix(e.kx); mix(e.ky); mix(e.hp); mix(e.state); mix(e.timer); mix(e.hitCd);
    }
    const mo = this.motes.items;
    for (let k = 0; k < this.motes.count; k++) { mix(mo[k].x); mix(mo[k].y); mix(mo[k].value); }
    return h >>> 0;
  }

  /** Orb speed relative to the world (for UI/fx). */
  orbSpeed(): number { return Math.hypot(this.orb.vx, this.orb.vy); }
  drainEvents(): GameEvent[] { const e = this.events.slice(); this.events.length = 0; return e; }
}
