// Headless fixed-step simulation. No DOM, no wall-clock, no Math.random: everything is seeded (core/rng.ts).
// Every number comes from src/data. Rule cards: design/mechanics/*.md. Tick order matches mechanics/README.md.
import { Pool } from '../core/pool';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import type { Intents } from '../core/input';
import { STEP } from '../core/loop';
import {
  ARENA_RADIUS, BASE_STATS, DIRECTOR, ENEMIES, EVENTS, ORBS, PHYSICS, PICKUPS, PROGRESSION, SHIPS, UPGRADES,
  computeStats, eligibleUpgrades, hitDamage, rollDraft, runStardust, xpMotes, xpToNext,
} from '../data';
import type { AnyEnemyId, BehaviorId, EnemyDef, PhysicsDef, PickupId, StatMod, Stats, UpgradeDef } from '../data';
import { pickMix, waveAt } from './director';
import type { DraftCard, DraftState, Enemy, GameEvent, OrbState, Pickup, Projectile, ReelPhase } from './types';

export interface WorldOptions {
  seed: number;
  god?: boolean;
  noSpawn?: boolean;
  /** keep N enemies alive at all times (stress test) */
  stress?: number;
  ship?: string;
  orb?: string;
  /** META_UNLOCKS ids owned (adds their upgrades to the draft pool) */
  unlockedMeta?: readonly string[];
  /** pick draft cards automatically (bots, ?skipTo) */
  autoDraft?: boolean;
  physics?: Partial<PhysicsDef>;
}

const MAX_ENEMIES = 640;
const MAX_PICKUPS = 520;
const XP_MOTE_SOFT_CAP = 400;
const TAU = Math.PI * 2;
const DEFS = new Map<AnyEnemyId, EnemyDef>(ENEMIES.map((d) => [d.id, d]));
const PICK_DEFS = new Map<PickupId, (typeof PICKUPS)[number]>(PICKUPS.map((d) => [d.id, d]));
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const angDiff = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const sub = (seed: number, k: number): number => (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(k + 1, 0xc2b2ae35)) >>> 0;

export class World {
  readonly P: PhysicsDef;
  seed: number;
  rngSpawn: Rng; rngDraft: Rng; rngDrops: Rng; rngAi: Rng;
  tick = 0;
  time = 0;
  god: boolean;
  noSpawn: boolean;
  stress: number;
  autoDraft: boolean;
  readonly unlockedMeta: Set<string>;
  readonly shipId: string;
  readonly orbId: string;

  // ---- entities
  ship = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, hp: 5, maxHp: 5, iframes: 0, radius: 14, aim: 0, regenAcc: 0 };
  orbs: OrbState[] = [];
  tether = { rest: 140, reelT: 0, maxLen: 224, phase: 'idle' as ReelPhase };
  enemies: Pool<Enemy>;
  pickups: Pool<Pickup>;
  projectiles: Pool<Projectile & { src: string }>;
  events: GameEvent[] = [];

  // ---- build
  mods: StatMod[] = [];
  stats: Stats = { ...BASE_STATS };
  stacks: Record<string, number> = {};
  behaviors = new Map<BehaviorId, Record<string, number>>();
  level = 1;
  xp = 0;
  xpNext = 10;
  pendingDrafts = 0;
  rerollsLeft = PROGRESSION.rerollsPerRun;
  draft: DraftState | null = null;
  private draftDefs: (UpgradeDef | null)[] = [];

  // ---- run result
  kills = 0;
  bossKills = 0;
  runPickups = 0;
  bonusStardust = 0;
  hitCount = 0;
  maxOrbSpeed = 0;
  outcome: 'dead' | 'won' | null = null;
  killedBy = '';
  endTime = 0;
  deadTime = 0;

  // ---- director
  hpMul = 1;
  private nextId = 1;
  private spawnAcc = 0;
  private fired: boolean[] = EVENTS.map(() => false);
  private warned: boolean[] = EVENTS.map(() => false);
  private rush: { at: number; enemy: AnyEnemyId; ang: number }[] = [];
  bossWarning: { boss: AnyEnemyId; at: number } | null = null;

  // ---- behavior state
  private prevReel = false;
  private shockCd = 0; private explodeCd = 0; private magnetT = 0;
  private killCounter = 0; private healTimes: number[] = [];

  private hash = new SpatialHash(64, 1800, MAX_ENEMIES);
  private tmp: number[] = [];
  private tmp2: number[] = [];

  constructor(opts: WorldOptions) {
    this.P = { ...PHYSICS, ...(opts.physics ?? {}) };
    this.seed = opts.seed >>> 0;
    this.rngSpawn = new Rng(0); this.rngDraft = new Rng(0); this.rngDrops = new Rng(0); this.rngAi = new Rng(0);
    this.god = !!opts.god;
    this.noSpawn = !!opts.noSpawn;
    this.stress = opts.stress ?? 0;
    this.autoDraft = !!opts.autoDraft;
    this.unlockedMeta = new Set(opts.unlockedMeta ?? []);
    this.shipId = SHIPS.some((s) => s.id === opts.ship) ? (opts.ship as string) : SHIPS[0].id;
    this.orbId = ORBS.some((o) => o.id === opts.orb) ? (opts.orb as string) : ORBS[0].id;
    const mkEnemy = (): Enemy => ({
      id: 0, kind: 'mite', def: ENEMIES[0], x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, kx: 0, ky: 0, ang: 0, hp: 0, maxHp: 0, radius: 0, mass: 1,
      state: 0, pat: -1, timer: 0, telTotal: 1, dirX: 1, dirY: 0, tx: 0, ty: 0, cd0: 0, cd1: 0, cd2: 0, hitCd0: 0, hitCd1: 0, hitCd2: 0,
      tetherCd: 0, thornsCd: 0, invuln: 0, stun: 0, roar: 0, flash: 0, phase2: false, aux: 0, aux2: 1, acc: 0, age: 0, summoner: 0, alive: false,
    });
    this.enemies = new Pool(MAX_ENEMIES, mkEnemy);
    this.pickups = new Pool(MAX_PICKUPS, () => ({ kind: 'xpSmall', x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, value: 1, age: 0, homing: false, alive: false }));
    this.projectiles = new Pool(PHYSICS.projectileHardCap, () => ({ kind: 'spit', x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 8, dmg: 1, life: 0, alive: false, src: '' }));
    this.restart(this.seed);
  }

  get orb(): OrbState { return this.orbs[0]; }

  /** Fresh run, same loadout. */
  restart(seed: number): void {
    this.seed = seed >>> 0;
    this.rngSpawn = new Rng(sub(this.seed, 1)); this.rngDraft = new Rng(sub(this.seed, 2));
    this.rngDrops = new Rng(sub(this.seed, 3)); this.rngAi = new Rng(sub(this.seed, 4));
    this.tick = 0; this.time = 0;
    this.enemies.clear(); this.pickups.clear(); this.projectiles.clear(); this.events.length = 0;
    this.kills = 0; this.bossKills = 0; this.runPickups = 0; this.bonusStardust = 0; this.hitCount = 0; this.maxOrbSpeed = 0;
    this.outcome = null; this.killedBy = ''; this.endTime = 0; this.deadTime = 0;
    this.nextId = 1; this.spawnAcc = 0; this.hpMul = 1;
    this.fired = EVENTS.map(() => false); this.warned = EVENTS.map(() => false); this.rush = []; this.bossWarning = null;
    this.stacks = {}; this.behaviors.clear(); this.level = 1; this.xp = 0; this.xpNext = xpToNext(1); this.pendingDrafts = 0;
    this.rerollsLeft = PROGRESSION.rerollsPerRun; this.draft = null; this.draftDefs = [];
    this.prevReel = false; this.shockCd = 0; this.explodeCd = 0; this.magnetT = 0; this.killCounter = 0; this.healTimes = [];
    const ship = SHIPS.find((s) => s.id === this.shipId)!, orb = ORBS.find((o) => o.id === this.orbId)!;
    this.mods = [...ship.mods, ...orb.mods];
    if (orb.behavior) this.behaviors.set(orb.behavior.id, orb.behavior.params);
    this.stats = computeStats(this.mods);
    const s = this.ship;
    s.x = s.px = 0; s.y = s.py = 0; s.vx = s.vy = 0; s.maxHp = this.stats.shipMaxHp; s.hp = s.maxHp; s.iframes = 0; s.aim = 0; s.regenAcc = 0;
    this.orbs = [];
    this.syncOrbs();
    this.tether.reelT = 0; this.tether.phase = 'idle';
    this.tether.rest = this.stats.tetherLength; this.tether.maxLen = this.stats.tetherLength * this.P.maxStretchRatio;
    if (this.stress > 0 && !this.noSpawn) {
      const kinds: AnyEnemyId[] = ['mite', 'mite', 'mite', 'dart', 'dart', 'wisp', 'wisp', 'blob', 'spitter', 'brute'];
      for (let i = 0; i < this.stress; i++) {
        const a = this.rngSpawn.range(0, TAU), d = Math.sqrt(this.rngSpawn.range(0.04, 0.8)) * ARENA_RADIUS;
        this.spawnEnemy(kinds[this.rngSpawn.int(kinds.length)], Math.cos(a) * d, Math.sin(a) * d);
      }
    }
  }

  // ------------------------------------------------------------------ stats / build
  private recomputeStats(): void {
    const before = this.ship.maxHp;
    this.stats = computeStats(this.mods);
    this.ship.maxHp = this.stats.shipMaxHp;
    if (this.ship.maxHp > before) this.ship.hp += this.ship.maxHp - before;
    this.ship.hp = Math.min(this.ship.hp, this.ship.maxHp);
    this.syncOrbs();
  }

  /** Keeps orbs.length === orbCount; new orbs spawn on the opposite side with the ship's velocity (tether-and-orb.md). */
  private syncOrbs(): void {
    const n = this.stats.orbCount, s = this.ship;
    while (this.orbs.length < n) {
      const i = this.orbs.length, L = this.stats.tetherLength * (1 - 0.2 * i), a = i * Math.PI;
      const x = s.x + Math.cos(a) * L, y = s.y + Math.sin(a) * L;
      this.orbs.push({ x, y, px: x, py: y, vx: s.vx, vy: s.vy, radius: this.stats.orbRadius, wallCd: 0 });
    }
    this.orbs.length = n;
    for (const o of this.orbs) o.radius = this.stats.orbRadius;
  }

  get reelPhase(): ReelPhase { return this.tether.phase; }

  // ------------------------------------------------------------------ step
  step(i: Intents): void {
    const dt = STEP;
    const s = this.ship;
    s.px = s.x; s.py = s.y;
    for (const o of this.orbs) { o.px = o.x; o.py = o.y; }
    const en = this.enemies.items;
    for (let k = 0; k < this.enemies.count; k++) { en[k].px = en[k].x; en[k].py = en[k].y; }
    const pk = this.pickups.items;
    for (let k = 0; k < this.pickups.count; k++) { pk[k].px = pk[k].x; pk[k].py = pk[k].y; }
    const pr = this.projectiles.items;
    for (let k = 0; k < this.projectiles.count; k++) { pr[k].px = pr[k].x; pr[k].py = pr[k].y; }

    if (this.outcome) { this.deadTime += dt; for (let k = 0; k < this.enemies.count; k++) if (en[k].flash > 0) en[k].flash -= dt; return; }
    if (this.draft) {
      if (this.autoDraft) this.pickDraft(this.level % this.draft.cards.length);
      else return;
    }

    this.stepShip(i, dt);
    this.stepOrbs(i.reel, dt);
    this.stepEnemies(dt);
    this.stepProjectiles(dt);
    this.stepHits();
    this.stepTether(dt);
    this.stepContact();
    this.stepPickups(dt);
    this.stepBehaviors(dt);
    this.stepDirector(dt);
    this.compact();
    this.tick++;
    this.time += dt;
    this.prevReel = i.reel;
    if (this.pendingDrafts > 0 && !this.draft && !this.outcome) this.openDraft();
  }

  // ------------------------------------------------------------------ ship
  private stepShip(i: Intents, dt: number): void {
    const st = this.stats, s = this.ship;
    let mx = i.moveX, my = i.moveY;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const tx = mx * st.shipSpeed, ty = my * st.shipSpeed;
    let dx = tx - s.vx, dy = ty - s.vy;
    const dl = Math.hypot(dx, dy), maxd = st.shipAccel * dt;
    if (dl > maxd) { dx *= maxd / dl; dy *= maxd / dl; }
    s.vx += dx; s.vy += dy;
    if (m > 0.1) s.aim = Math.atan2(my, mx);
    s.x += s.vx * dt; s.y += s.vy * dt;
    const lim = ARENA_RADIUS - s.radius, d2 = Math.hypot(s.x, s.y);
    if (d2 > lim) {
      const nx = s.x / d2, ny = s.y / d2;
      s.x = nx * lim; s.y = ny * lim;
      const vn = s.vx * nx + s.vy * ny;
      if (vn > 0) { s.vx -= nx * vn; s.vy -= ny * vn; }
    }
    if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
    // regen (health.md): no banking at full HP
    if (st.regenPerMin > 0) {
      s.regenAcc = Math.min(1, s.regenAcc + (st.regenPerMin / 60) * dt);
      if (s.regenAcc >= 1 && s.hp < s.maxHp) { s.hp++; s.regenAcc -= 1; this.events.push({ type: 'heal', x: s.x, y: s.y, amount: 1 }); }
    }
  }

  // ------------------------------------------------------------------ orbs (greybox t11 physics, per orb)
  private stepOrbs(reel: boolean, dt: number): void {
    const P = this.P, st = this.stats, s = this.ship, th = this.tether;
    const prevT = th.reelT;
    th.reelT = clamp01(th.reelT + (reel ? dt / P.reelTimeSec : -dt / P.reelReleaseSec));
    const transitioning = th.reelT !== prevT;
    const held = reel && th.reelT >= 1;
    const nextPhase: ReelPhase = reel ? (th.reelT < 1 ? 'reeling' : 'held') : th.reelT > 0 ? 'releasing' : 'idle';
    if (reel && !this.prevReel) this.events.push({ type: 'reelStart', speed: this.orbSpeed() });
    if (!reel && this.prevReel) this.events.push({ type: 'reelEnd' });
    th.phase = nextPhase;
    const SUB = 2, h = dt / SUB;
    for (let oi = 0; oi < this.orbs.length; oi++) {
      const o = this.orbs[oi];
      const Li = st.tetherLength * (1 - 0.2 * oi);
      const restAt = (t: number): number => Li * (1 - (1 - st.reelRatio) * t);
      const rest = restAt(th.reelT), maxLen = Li * P.maxStretchRatio;
      if (oi === 0) { th.rest = rest; th.maxLen = maxLen; }
      // Kinematic reel-in: while the rest length shrinks, project a taut orb onto the smaller radius and scale its
      // tangential velocity by r_old / r_new (angular momentum conserved). The spring is not relied on to pull it in.
      if (th.reelT > prevT) {
        const restOld = restAt(prevT);
        const rx = o.x - s.x, ry = o.y - s.y, L = Math.hypot(rx, ry);
        if (L > rest && L > 8) {
          const rNew = Math.max(rest, L * (rest / restOld));
          const nx = rx / L, ny = ry / L;
          const rvx = o.vx - s.vx, rvy = o.vy - s.vy;
          const vt = nx * rvy - ny * rvx;
          const vtNew = vt * (L / rNew);
          o.x = s.x + nx * rNew; o.y = s.y + ny * rNew;
          o.vx = s.vx - ny * vtNew; o.vy = s.vy + nx * vtNew;
        }
      }
      if (o.wallCd > 0) o.wallCd -= dt;
      for (let n = 0; n < SUB; n++) {
        let rx = o.x - s.x, ry = o.y - s.y;
        let L = Math.hypot(rx, ry);
        let rvx = o.vx - s.vx, rvy = o.vy - s.vy;
        const drag = Math.max(0, 1 - (P.orbDrag + (held ? P.heldReelExtraDamping : 0)) * h);
        const hTarget = (rx * rvy - ry * rvx) * drag; // angular momentum (per unit mass) after drag
        if (L > 1e-6) {
          const nx = rx / L, ny = ry / L;
          if (L > rest) {
            const radV = rvx * nx + rvy * ny;
            const pull = Math.max(0, (st.tetherStiffness * (L - rest)) / st.orbMass + P.tetherDamping * radV);
            o.vx -= nx * pull * h; o.vy -= ny * pull * h;
          }
        }
        // drag acts on velocity RELATIVE to the ship, so a carried orb isn't slowed (tether-and-orb.md)
        o.vx = s.vx + (o.vx - s.vx) * drag; o.vy = s.vy + (o.vy - s.vy) * drag;
        o.x += o.vx * h; o.y += o.vy * h;
        rx = o.x - s.x; ry = o.y - s.y; L = Math.hypot(rx, ry);
        if (L > maxLen) {
          const nx = rx / L, ny = ry / L;
          o.x = s.x + nx * maxLen; o.y = s.y + ny * maxLen; L = maxLen;
          const vr = (o.vx - s.vx) * nx + (o.vy - s.vy) * ny;
          if (vr > 0) { o.vx -= nx * vr; o.vy -= ny * vr; }
        }
        // fully reeled and held: rigid rope (strip only outward radial velocity, keep tangential speed)
        if (held && L > rest) {
          const nx = rx / L, ny = ry / L;
          o.x = s.x + nx * rest; o.y = s.y + ny * rest; L = rest;
          const vr = (o.vx - s.vx) * nx + (o.vy - s.vy) * ny;
          if (vr > 0) { o.vx -= nx * vr; o.vy -= ny * vr; }
        }
        if (transitioning && L > 8) {
          const nx = (o.x - s.x) / L, ny = (o.y - s.y) / L;
          rvx = o.vx - s.vx; rvy = o.vy - s.vy;
          const vt = nx * rvy - ny * rvx;
          const want = hTarget / L;
          o.vx += -ny * (want - vt); o.vy += nx * (want - vt);
        }
        const sp = Math.hypot(o.vx, o.vy);
        if (sp > P.maxOrbSpeed) { o.vx *= P.maxOrbSpeed / sp; o.vy *= P.maxOrbSpeed / sp; }
        const od = Math.hypot(o.x, o.y), olim = ARENA_RADIUS - o.radius;
        if (od > olim) {
          const nx = o.x / od, ny = o.y / od;
          o.x = nx * olim; o.y = ny * olim;
          const vn = o.vx * nx + o.vy * ny;
          if (vn > 0) {
            const speedBefore = Math.hypot(o.vx, o.vy);
            o.vx -= nx * vn * 2; o.vy -= ny * vn * 2; // reflect
            if (o.wallCd <= 0) { o.vx *= 1 - P.wallSpeedLoss; o.vy *= 1 - P.wallSpeedLoss; o.wallCd = 0.15; this.events.push({ type: 'orbWall', x: o.x, y: o.y, speed: speedBefore }); }
          }
        }
      }
    }
    const sp = this.orbSpeed();
    if (sp > this.maxOrbSpeed) this.maxOrbSpeed = sp;
  }

  // ------------------------------------------------------------------ enemies
  def(kind: AnyEnemyId): EnemyDef { return DEFS.get(kind) as EnemyDef; }

  spawnEnemy(kind: AnyEnemyId, x: number, y: number, hpMul = this.hpMul): Enemy | null {
    const e = this.enemies.acquire();
    if (!e) return null;
    const d = this.def(kind), boss = d.ai === 'boss', P = d.params;
    e.id = this.nextId++; e.kind = kind; e.def = d;
    e.x = e.px = x; e.y = e.py = y; e.vx = e.vy = e.kx = e.ky = 0;
    e.ang = this.rngAi.range(0, TAU);
    e.hp = e.maxHp = boss ? d.hp : d.hp * hpMul; e.radius = d.radius; e.mass = d.mass;
    e.state = 0; e.pat = -1; e.timer = 0; e.telTotal = 1; e.dirX = 1; e.dirY = 0; e.tx = e.ty = 0;
    e.cd0 = e.cd1 = e.cd2 = 0; e.hitCd0 = e.hitCd1 = e.hitCd2 = 0; e.tetherCd = 0; e.thornsCd = 0;
    e.invuln = 0; e.stun = 0; e.roar = 0; e.flash = 0; e.phase2 = false; e.aux = 0; e.aux2 = this.rngAi.next() < 0.5 ? 1 : -1; e.acc = 0;
    e.age = 0; e.summoner = 0; e.alive = true;
    switch (d.ai) {
      case 'dasher': e.cd0 = 0; break;
      case 'orbiter': e.cd0 = P.cooldownSec; break;
      case 'shooter': e.cd0 = this.rngAi.range(0.4, P.fireIntervalSec); break;
      case 'tank': e.cd0 = this.rngAi.range(0, P.chargeCooldownSec); break;
      case 'boss':
        if (kind === 'warden') { e.cd0 = P.ringIntervalSec * 0.6; e.cd1 = P.chargeIntervalSec * 0.7; }
        else if (kind === 'hive') { e.cd0 = P.broodIntervalSec * 0.5; e.cd1 = P.volleyIntervalSec * 0.8; }
        else { e.cd0 = P.spiralIntervalSec * 0.5; e.cd1 = P.blinkIntervalSec * 0.8; e.cd2 = P.wellIntervalSec; }
        break;
      default:
    }
    return e;
  }

  private onScreen(e: Enemy): boolean {
    return Math.abs(e.x - this.ship.x) < 680 && Math.abs(e.y - this.ship.y) < 400;
  }

  private steer(e: Enemy, tx: number, ty: number, speed: number, turn: number, dt: number): void {
    const want = Math.atan2(ty - e.y, tx - e.x);
    const d = angDiff(e.ang, want), m = turn * dt;
    e.ang += Math.abs(d) <= m ? d : Math.sign(d) * m;
    e.vx = Math.cos(e.ang) * speed; e.vy = Math.sin(e.ang) * speed;
  }

  private isSlowed(e: Enemy): boolean {
    const f = this.behaviors.get('slowField');
    if (!f || e.def.ai === 'boss') return false;
    if (f.onlyWhileReeling && this.tether.phase !== 'reeling' && this.tether.phase !== 'held') return false;
    const r = f.radius + e.radius;
    for (const o of this.orbs) { const dx = e.x - o.x, dy = e.y - o.y; if (dx * dx + dy * dy < r * r) return true; }
    return false;
  }

  private stepEnemies(dt: number): void {
    const s = this.ship, en = this.enemies.items, n = this.enemies.count;
    const kd = Math.exp(-this.P.knockbackDecayPerSec * dt);
    for (let k = 0; k < n; k++) {
      const e = en[k];
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.tetherCd > 0) e.tetherCd -= dt;
      if (e.thornsCd > 0) e.thornsCd -= dt;
      if (e.hitCd0 > 0) e.hitCd0 -= dt;
      if (e.hitCd1 > 0) e.hitCd1 -= dt;
      if (e.hitCd2 > 0) e.hitCd2 -= dt;
      e.age += dt;
      this.runAi(e, dt);
      if (e.def.ai !== 'boss' && this.isSlowed(e)) { const m = 1 - this.behaviors.get('slowField')!.slowPct; e.vx *= m; e.vy *= m; }
      e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
      e.kx *= kd; e.ky *= kd;
      const ed = Math.hypot(e.x, e.y), lim = ARENA_RADIUS - (e.def.ai === 'boss' ? 0 : 0);
      if (ed > lim) { e.x *= lim / ed; e.y *= lim / ed; }
    }
    // spatial hash + soft separation (never pushes the ship)
    const h = this.hash; h.clear();
    for (let k = 0; k < n; k++) h.insert(en[k].x, en[k].y, en[k].radius);
    const tmp = this.tmp;
    for (let k = 0; k < n; k++) {
      const e = en[k];
      if (!e.alive || e.def.ai === 'boss') continue;
      h.query(e.x, e.y, e.radius, tmp);
      for (let q = 0; q < tmp.length; q++) {
        const j = tmp[q];
        if (j === k) continue;
        const o2 = en[j];
        let dx = e.x - o2.x, dy = e.y - o2.y;
        const dd = Math.hypot(dx, dy), min = e.radius + o2.radius;
        if (dd >= min) continue;
        if (dd < 1e-4) { dx = 1; dy = 0; } else { dx /= dd; dy /= dd; }
        const push = Math.min(1, (min - dd) * 0.25 * (o2.mass / (e.mass + o2.mass)) * 2);
        e.x += dx * push; e.y += dy * push;
      }
    }
    void s;
  }

  private runAi(e: Enemy, dt: number): void {
    const s = this.ship, d = e.def, P = d.params;
    let dx = s.x - e.x, dy = s.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist; dy /= dist;
    switch (d.ai) {
      case 'chaser':
        this.steer(e, s.x, s.y, d.speed, P.turnRate ?? 6, dt);
        break;
      case 'splitter':
        this.steer(e, s.x, s.y, d.speed, 6, dt);
        break;
      case 'dasher': {
        if (e.cd0 > 0) e.cd0 -= dt;
        if (e.state === 0) {
          this.steer(e, s.x, s.y, d.speed, 6, dt);
          if (dist < P.triggerRange && e.cd0 <= 0 && this.onScreen(e)) { e.state = 1; e.timer = e.telTotal = P.telegraphSec; e.dirX = dx; e.dirY = dy; e.vx = e.vy = 0; }
        } else if (e.state === 1) {
          e.vx = e.vy = 0; e.timer -= dt; e.ang = Math.atan2(e.dirY, e.dirX);
          if (e.timer <= 0) { e.state = 2; e.timer = P.dashSec; }
        } else {
          e.vx = e.dirX * P.dashSpeed; e.vy = e.dirY * P.dashSpeed; e.timer -= dt;
          if (e.timer <= 0) { e.state = 0; e.cd0 = P.cooldownSec; }
        }
        break;
      }
      case 'orbiter': {
        if (e.cd0 > 0) e.cd0 -= dt;
        if (e.state === 0) {
          const ux = -dx, uy = -dy; // ship -> enemy
          const err = dist - P.orbitRadius;
          if (Math.abs(err) > 60) {
            const sgn = err > 0 ? 1 : -1;
            e.vx = dx * d.speed * sgn; e.vy = dy * d.speed * sgn;
            e.aux = 0;
          } else {
            e.aux += dt;
            const tang = P.orbitAngularSpeed * P.orbitRadius * e.aux2;
            const rad = Math.max(-d.speed, Math.min(d.speed, -err * 3));
            e.vx = -uy * tang + ux * rad; e.vy = ux * tang + uy * rad;
            if (e.aux >= P.firstLungeDelaySec && e.cd0 <= 0 && this.onScreen(e)) { e.state = 1; e.timer = e.telTotal = P.telegraphSec; e.dirX = dx; e.dirY = dy; e.vx = e.vy = 0; }
          }
          e.ang = Math.atan2(e.vy, e.vx);
        } else if (e.state === 1) {
          e.vx = e.vy = 0; e.timer -= dt; e.ang = Math.atan2(e.dirY, e.dirX);
          if (e.timer <= 0) { e.state = 2; e.timer = P.lungeSec; }
        } else {
          e.vx = e.dirX * P.lungeSpeed; e.vy = e.dirY * P.lungeSpeed; e.timer -= dt;
          if (e.timer <= 0) { e.state = 0; e.cd0 = P.cooldownSec; }
        }
        break;
      }
      case 'shooter': {
        if (e.cd0 > 0) e.cd0 -= dt;
        e.ang = Math.atan2(dy, dx);
        if (e.state === 0) {
          const err = dist - P.keepDistance;
          if (err > P.distanceTolerance) { e.vx = dx * d.speed; e.vy = dy * d.speed; }
          else if (err < -P.distanceTolerance) { e.vx = -dx * d.speed; e.vy = -dy * d.speed; }
          else { e.vx = -dy * d.speed * 0.6 * e.aux2; e.vy = dx * d.speed * 0.6 * e.aux2; }
          if (e.cd0 <= 0 && this.onScreen(e)) { e.state = 1; e.timer = e.telTotal = P.telegraphSec; }
        } else {
          e.vx *= 0.9; e.vy *= 0.9; e.timer -= dt;
          e.dirX = dx; e.dirY = dy;
          if (e.timer <= 0) {
            this.fire(e.x, e.y, Math.atan2(dy, dx), P.projectileSpeed, P.projectileDamage, P.projectileRadius, P.projectileLifeSec, 'spit', 'Spitter spit');
            e.state = 0; e.cd0 = P.fireIntervalSec;
          }
        }
        break;
      }
      case 'tank': {
        if (e.cd0 > 0) e.cd0 -= dt;
        if (e.state === 0) {
          this.steer(e, s.x, s.y, d.speed, 3, dt);
          if (dist < P.chargeRange && e.cd0 <= 0 && this.onScreen(e)) { e.state = 1; e.timer = e.telTotal = P.chargeTelegraphSec; e.dirX = dx; e.dirY = dy; e.vx = e.vy = 0; }
        } else if (e.state === 1) {
          e.vx = e.vy = 0; e.timer -= dt; e.ang = Math.atan2(e.dirY, e.dirX);
          if (e.timer <= 0) { e.state = 2; e.timer = P.chargeSec; }
        } else {
          e.vx = e.dirX * P.chargeSpeed; e.vy = e.dirY * P.chargeSpeed; e.timer -= dt;
          if (e.timer <= 0) { e.state = 0; e.cd0 = P.chargeCooldownSec; }
        }
        break;
      }
      case 'boss':
        this.runBoss(e, dt, dx, dy, dist);
        break;
      default:
    }
  }

  // ------------------------------------------------------------------ bosses (bosses.md): one pattern at a time
  private bossInterval(e: Enemy, base: number): number {
    return base * (e.phase2 ? (e.def.params.phase2IntervalMul ?? 1) : 1);
  }

  private runBoss(e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
    const P = e.def.params, s = this.ship;
    if (!e.phase2 && e.hp <= e.maxHp * P.phase2HpPct) {
      e.phase2 = true; e.roar = 0.5;
      this.events.push({ type: 'bossPhase', boss: e.kind });
    }
    if (e.roar > 0) { e.roar -= dt; e.vx = e.vy = 0; return; }
    if (e.stun > 0) { e.stun -= dt; e.vx = e.vy = 0; if (e.cd0 > 0) e.cd0 -= dt; if (e.cd1 > 0) e.cd1 -= dt; if (e.cd2 > 0) e.cd2 -= dt; return; }
    if (e.cd0 > 0) e.cd0 -= dt;
    if (e.cd1 > 0) e.cd1 -= dt;
    if (e.cd2 > 0) e.cd2 -= dt;
    if (e.state === 0) {
      e.ang = Math.atan2(dy, dx);
      if (dist > e.radius + 40) { e.vx = dx * e.def.speed; e.vy = dy * e.def.speed; } else e.vx = e.vy = 0;
      // pick the first pattern that is due
      let pat = -1;
      if (e.cd0 <= 0) pat = 0; else if (e.cd1 <= 0) pat = 1; else if (e.kind === 'eclipse' && e.phase2 && e.cd2 <= 0) pat = 2;
      if (pat < 0) return;
      e.pat = pat; e.state = 1; e.vx = e.vy = 0;
      e.dirX = dx; e.dirY = dy; e.acc = 0;
      let tele = 0.8;
      if (e.kind === 'warden') tele = pat === 0 ? P.ringTelegraphSec : P.chargeTelegraphSec;
      else if (e.kind === 'hive') tele = pat === 0 ? P.broodTelegraphSec : P.volleyTelegraphSec;
      else tele = pat === 0 ? P.spiralTelegraphSec : pat === 1 ? P.blinkTelegraphSec : P.wellTelegraphSec;
      e.timer = e.telTotal = tele;
      if (e.kind === 'eclipse' && pat === 1) {
        // blink target: the ship's position now, at least blinkMinDistance from the boss
        let tx = s.x, ty = s.y;
        const bd = Math.hypot(tx - e.x, ty - e.y);
        if (bd < P.blinkMinDistance) { const ux = bd > 1 ? (tx - e.x) / bd : 1, uy = bd > 1 ? (ty - e.y) / bd : 0; tx = e.x + ux * P.blinkMinDistance; ty = e.y + uy * P.blinkMinDistance; }
        const td = Math.hypot(tx, ty), lim = ARENA_RADIUS - e.radius;
        if (td > lim) { tx *= lim / td; ty *= lim / td; }
        e.tx = tx; e.ty = ty;
      }
      return;
    }
    if (e.state === 1) {
      e.vx = e.vy = 0; e.timer -= dt;
      if (e.pat === 0 && e.kind !== 'warden' && e.kind !== 'eclipse') e.ang = Math.atan2(e.dirY, e.dirX);
      if (e.pat === 1 && e.kind === 'warden') e.ang = Math.atan2(e.dirY, e.dirX);
      if (e.timer > 0) return;
      this.bossTelegraphEnd(e, P);
      return;
    }
    // state 2: pattern in progress
    e.timer -= dt;
    if (e.kind === 'warden' && e.pat === 1) {
      e.vx = e.dirX * P.chargeSpeed; e.vy = e.dirY * P.chargeSpeed;
      const reach = Math.hypot(e.x, e.y) + e.radius;
      if (reach >= ARENA_RADIUS - 2) {
        e.stun = P.wallStunSec; e.state = 0; e.vx = e.vy = 0; e.cd1 = this.bossInterval(e, P.chargeIntervalSec);
        this.events.push({ type: 'bossStun', x: e.x, y: e.y });
        return;
      }
      if (e.timer <= 0) { e.state = 0; e.cd1 = this.bossInterval(e, P.chargeIntervalSec); }
    } else if (e.kind === 'eclipse' && e.pat === 0) {
      e.vx = e.vy = 0;
      const arms = P.spiralArms, rate = P.spiralShotsPerSecPerArm * arms;
      e.acc += dt * rate;
      const base = e.aux + (P.spiralTurnDegPerSec * Math.PI / 180) * (P.spiralDurationSec - e.timer);
      e.ang = base;
      while (e.acc >= 1) {
        e.acc -= 1; e.aux2 = (e.aux2 + 1) % arms; // round-robin arm
        const a = base + (e.aux2 * TAU) / arms;
        this.fire(e.x + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius, a, P.spiralSpeed, P.projectileDamage, 9, 7, 'bossBolt', 'Eclipse spiral');
      }
      if (e.timer <= 0) { e.state = 0; e.cd0 = this.bossInterval(e, P.spiralIntervalSec); e.aux2 = 1; }
    } else if (e.kind === 'eclipse' && e.pat === 2) {
      e.vx = e.vy = 0;
      const R = P.wellRadius;
      for (const o of this.orbs) {
        const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy);
        if (od < R && od > 1) { o.vx += (ox / od) * P.wellOrbPull * dt; o.vy += (oy / od) * P.wellOrbPull * dt; }
      }
      if (dist < R) { s.x += dx * P.wellShipPull * dt; s.y += dy * P.wellShipPull * dt; }
      if (e.timer <= 0) { e.state = 0; e.cd2 = this.bossInterval(e, P.wellIntervalSec); }
    } else {
      e.state = 0;
    }
  }

  private bossTelegraphEnd(e: Enemy, P: Record<string, number>): void {
    const s = this.ship;
    if (e.kind === 'warden') {
      if (e.pat === 0) {
        const n = e.phase2 ? P.phase2RingCount : P.ringCount;
        const rot = e.phase2 ? (P.phase2RingRotateDeg * Math.PI / 180) * e.aux2 : 0;
        e.aux2 += 1;
        for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; this.fire(e.x + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius, a, P.ringSpeed, P.projectileDamage, 9, 6, 'bossBolt', 'Warden ring'); }
        e.state = 0; e.cd0 = this.bossInterval(e, P.ringIntervalSec);
      } else { e.state = 2; e.timer = P.chargeSec; }
    } else if (e.kind === 'hive') {
      if (e.pat === 0) {
        let alive = 0;
        for (let k = 0; k < this.enemies.count; k++) if (this.enemies.items[k].alive && this.enemies.items[k].summoner === e.id) alive++;
        const n = e.phase2 ? P.phase2BroodCount : P.broodCount;
        if (alive < P.maxSummonsAlive) {
          const a0 = this.rngAi.range(0, TAU);
          for (let i = 0; i < n && alive + i < P.maxSummonsAlive; i++) {
            const a = a0 + (i / n) * TAU, r = e.radius + 10;
            const c = this.spawnEnemy('blobling', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
            if (c) { c.summoner = e.id; c.kx = Math.cos(a) * 160; c.ky = Math.sin(a) * 160; }
          }
        }
        e.state = 0; e.cd0 = this.bossInterval(e, P.broodIntervalSec);
      } else {
        const n = P.volleyCount, spread = (P.volleySpreadDeg * Math.PI) / 180, aim = Math.atan2(e.dirY, e.dirX);
        for (let i = 0; i < n; i++) { const a = aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread); this.fire(e.x + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius, a, P.volleySpeed, P.projectileDamage, 9, 6, 'bossBolt', 'Hive volley'); }
        e.state = 0; e.cd1 = this.bossInterval(e, P.volleyIntervalSec);
      }
    } else {
      if (e.pat === 0) { e.state = 2; e.timer = P.spiralDurationSec; e.aux = Math.atan2(e.dirY, e.dirX); e.aux2 = 0; e.acc = 0; }
      else if (e.pat === 1) {
        e.x = e.tx; e.y = e.ty;
        const bd = Math.hypot(s.x - e.tx, s.y - e.ty);
        if (bd < P.blinkRadius) this.hurtShip(P.blinkDamage, e.tx, e.ty, 'Eclipse blink');
        e.state = 0; e.cd1 = this.bossInterval(e, P.blinkIntervalSec);
      } else { e.state = 2; e.timer = P.wellDurationSec; }
    }
  }

  // ------------------------------------------------------------------ projectiles
  private fire(x: number, y: number, ang: number, speed: number, dmg: number, r: number, life: number, kind: 'spit' | 'bossBolt', src: string): void {
    let p = this.projectiles.acquire();
    if (!p) { // hard cap: drop the projectile closest to expiring (oldest)
      let best = 0, bl = Infinity;
      for (let k = 0; k < this.projectiles.count; k++) if (this.projectiles.items[k].life < bl) { bl = this.projectiles.items[k].life; best = k; }
      p = this.projectiles.items[best];
    }
    p.kind = kind; p.x = p.px = x; p.y = p.py = y; p.vx = Math.cos(ang) * speed; p.vy = Math.sin(ang) * speed;
    p.r = r; p.dmg = dmg; p.life = life; p.alive = true; p.src = src;
  }

  private stepProjectiles(dt: number): void {
    const pr = this.projectiles.items, s = this.ship;
    const minSp = this.stats.minDamageSpeed;
    for (let k = 0; k < this.projectiles.count; k++) {
      const p = pr[k];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0 || Math.hypot(p.x, p.y) > ARENA_RADIUS + 60) { p.alive = false; continue; }
      // the orb swats projectiles at or above minDamageSpeed (no cost)
      for (const o of this.orbs) {
        const rr = o.radius + p.r;
        if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < rr * rr && Math.hypot(o.vx, o.vy) >= minSp) { p.alive = false; this.events.push({ type: 'swat', x: p.x, y: p.y }); break; }
      }
      if (!p.alive) continue;
      const rr = s.radius + p.r;
      if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 < rr * rr) { p.alive = false; this.hurtShip(p.dmg, p.x, p.y, p.src); }
    }
  }

  // ------------------------------------------------------------------ orb vs enemies (damage-and-crit.md)
  private hitCdOf(e: Enemy, oi: number): number { return oi === 0 ? e.hitCd0 : oi === 1 ? e.hitCd1 : e.hitCd2; }
  private setHitCd(e: Enemy, oi: number, v: number): void { if (oi === 0) e.hitCd0 = v; else if (oi === 1) e.hitCd1 = v; else e.hitCd2 = v; }

  private stepHits(): void {
    const P = this.P, st = this.stats, en = this.enemies.items;
    const tmp = this.tmp;
    for (let oi = 0; oi < this.orbs.length; oi++) {
      const o = this.orbs[oi];
      const speed = Math.hypot(o.vx, o.vy);
      if (speed < 1) continue;
      const sx = o.px, sy = o.py, ex = o.x, ey = o.y;
      const sdx = ex - sx, sdy = ey - sy, seg2 = sdx * sdx + sdy * sdy;
      const qr = Math.sqrt(seg2) / 2 + o.radius + 90; // + biggest enemy radius
      this.hash.query((sx + ex) / 2, (sy + ey) / 2, qr, tmp);
      if (tmp.length > 1) tmp.sort((a, b) => a - b);
      let anyDamage = false;
      for (let q = 0; q < tmp.length; q++) {
        const e = en[tmp[q]];
        if (!e.alive || e.invuln > 0 || this.hitCdOf(e, oi) > 0) continue;
        let t = seg2 > 1e-9 ? ((e.x - sx) * sdx + (e.y - sy) * sdy) / seg2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = sx + sdx * t, cy = sy + sdy * t;
        const dx = e.x - cx, dy = e.y - cy, rr = o.radius + e.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        const ep = e.def.params;
        const res = hitDamage(speed, st, ep.armorSpeed ? { armorSpeed: ep.armorSpeed, armorDamageMul: ep.armorDamageMul } : undefined);
        const v = Math.min(speed, P.maxOrbSpeed);
        const inv = 1 / speed, nx = o.vx * inv, ny = o.vy * inv;
        const resist = ep.knockbackResist ?? 0;
        const kb = (v * P.knockbackBase * st.knockback * st.orbMass) / e.mass * (1 - resist);
        e.kx += nx * kb; e.ky += ny * kb;
        this.setHitCd(e, oi, P.hitCooldownSec);
        this.hitCount++;
        const boss = e.def.ai === 'boss';
        if (res.bump) {
          this.events.push({ type: 'hit', x: e.x, y: e.y, nx, ny, dmg: 0, crit: false, bump: true, secondary: false, speed: v, kind: e.kind, boss });
          continue;
        }
        let dmg = res.damage;
        if (e.stun > 0 && ep.stunnedDamageMul) dmg = Math.round(dmg * ep.stunnedDamageMul);
        e.hp -= dmg; e.flash = 0.09; anyDamage = true;
        if (e.kind === 'dart' && e.state === 2) { e.timer = 0; }
        this.events.push({ type: 'hit', x: e.x, y: e.y, nx, ny, dmg, crit: res.crit, bump: false, secondary: false, speed: v, kind: e.kind, boss });
        if (res.crit) {
          this.behaviorChain(e, dmg);
          this.behaviorExplode(e, dmg);
        }
        if (e.hp <= 0) this.killEnemy(e, nx, ny);
      }
      if (anyDamage) { o.vx *= 1 - P.enemyHitSpeedLoss; o.vy *= 1 - P.enemyHitSpeedLoss; }
    }
  }

  /** Secondary damage: never crits, never triggers behaviors, integer. */
  private secondary(e: Enemy, dmg: number, nx = 0, ny = 0): void {
    if (!e.alive || e.invuln > 0) return;
    dmg = Math.round(dmg);
    if (dmg <= 0) return;
    e.hp -= dmg; e.flash = 0.09;
    this.events.push({ type: 'hit', x: e.x, y: e.y, nx, ny, dmg, crit: false, bump: false, secondary: true, speed: 0, kind: e.kind, boss: e.def.ai === 'boss' });
    if (e.hp <= 0) this.killEnemy(e, nx, ny);
  }

  private behaviorChain(from: Enemy, critDmg: number): void {
    const b = this.behaviors.get('chainOnCrit');
    if (!b) return;
    const en = this.enemies.items, hit = new Set<number>([from.id]);
    let cur = from;
    for (let j = 0; j < b.jumps; j++) {
      this.hash.query(cur.x, cur.y, b.range + 90, this.tmp2);
      let best: Enemy | null = null, bd = Infinity;
      for (let q = 0; q < this.tmp2.length; q++) {
        const c = en[this.tmp2[q]];
        if (!c.alive || hit.has(c.id)) continue;
        const d = Math.hypot(c.x - cur.x, c.y - cur.y) - c.radius;
        if (d <= b.range && d < bd) { bd = d; best = c; }
      }
      if (!best) break;
      hit.add(best.id);
      this.events.push({ type: 'chain', x1: cur.x, y1: cur.y, x2: best.x, y2: best.y });
      this.secondary(best, critDmg * b.damagePct);
      cur = best;
    }
  }

  private behaviorExplode(at: Enemy, critDmg: number): void {
    const b = this.behaviors.get('orbExplodeOnCrit');
    if (!b || this.explodeCd > 0) return;
    this.explodeCd = b.cooldownSec;
    this.events.push({ type: 'explosion', x: at.x, y: at.y, r: b.radius });
    const en = this.enemies.items;
    this.hash.query(at.x, at.y, b.radius + 90, this.tmp2);
    const list = this.tmp2.slice();
    for (const idx of list) {
      const c = en[idx];
      if (!c.alive || c === at) continue;
      if (Math.hypot(c.x - at.x, c.y - at.y) <= b.radius + c.radius) this.secondary(c, critDmg * b.damagePct);
    }
  }

  private killEnemy(e: Enemy, nx: number, ny: number): void {
    if (!e.alive) return;
    e.alive = false;
    const d = e.def, boss = d.ai === 'boss';
    this.kills++;
    this.events.push({ type: 'kill', x: e.x, y: e.y, kind: e.kind, boss });
    // vampiric (any kill)
    const vamp = this.behaviors.get('vampiric');
    if (vamp) {
      this.killCounter++;
      if (this.killCounter >= vamp.killsPerHeal) {
        this.killCounter = 0;
        this.healTimes = this.healTimes.filter((t) => this.time - t < 60);
        if (this.ship.hp < this.ship.maxHp && this.healTimes.length < vamp.maxHealsPerMin) {
          this.healTimes.push(this.time);
          this.ship.hp++;
          this.events.push({ type: 'heal', x: this.ship.x, y: this.ship.y, amount: 1 });
        }
      }
    }
    // drops
    const r = this.rngDrops;
    const mo = xpMotes(d.xp);
    for (let i = 0; i < mo.xpBig; i++) this.dropPickup('xpBig', e.x, e.y, 16);
    for (let i = 0; i < mo.xpSmall; i++) this.dropPickup('xpSmall', e.x, e.y, 16);
    const sd = r.next(), hd = r.next(), md = r.next();
    if (boss || sd < d.stardustChance) this.dropPickup('stardust', e.x, e.y, 16);
    if (boss) this.dropPickup('heart', e.x, e.y, 24);
    else {
      if (hd < (PICK_DEFS.get('heart')?.dropChance ?? 0)) this.dropPickup('heart', e.x, e.y, 10);
      if (md < (PICK_DEFS.get('magnet')?.dropChance ?? 0)) this.dropPickup('magnet', e.x, e.y, 10);
    }
    // splits
    if (d.splitInto) {
      const n = d.splitCount ?? 2, P = d.params;
      const px = -ny, py = nx;
      for (let i = 0; i < n; i++) {
        const sg = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2; // -1..1
        const c = this.spawnEnemy(d.splitInto, e.x + px * P.splitSpreadPx * sg, e.y + py * P.splitSpreadPx * sg);
        if (c) { c.invuln = P.splitInvulnSec; c.flash = P.splitInvulnSec; c.kx = px * P.splitImpulse * sg + nx * 60; c.ky = py * P.splitImpulse * sg + ny * 60; }
      }
    }
    if (boss) {
      this.bossKills++;
      this.events.push({ type: 'bossDie', boss: e.kind, x: e.x, y: e.y });
      if (e.kind === 'eclipse') this.finish('won');
    }
  }

  private dropPickup(kind: PickupId, x: number, y: number, scatter: number): void {
    const def = PICK_DEFS.get(kind)!;
    const a = this.rngDrops.range(0, TAU), rr = this.rngDrops.range(0, scatter);
    const value = def.value;
    let p = this.pickups.acquire();
    if (!p) {
      if (kind === 'xpSmall' || kind === 'xpBig') { // merge into the oldest xp mote: no XP is destroyed
        let oldest: Pickup | null = null;
        for (let k = 0; k < this.pickups.count; k++) { const c = this.pickups.items[k]; if ((c.kind === 'xpSmall' || c.kind === 'xpBig') && (!oldest || c.age > oldest.age)) oldest = c; }
        if (oldest) { oldest.value += value; oldest.kind = oldest.value >= 5 ? 'xpBig' : 'xpSmall'; }
      }
      return;
    }
    if ((kind === 'xpSmall' || kind === 'xpBig') && this.pickups.count > XP_MOTE_SOFT_CAP + 100) {
      let oldest: Pickup | null = null;
      for (let k = 0; k < this.pickups.count - 1; k++) { const c = this.pickups.items[k]; if ((c.kind === 'xpSmall' || c.kind === 'xpBig') && (!oldest || c.age > oldest.age)) oldest = c; }
      if (oldest) { oldest.value += value; oldest.kind = oldest.value >= 5 ? 'xpBig' : 'xpSmall'; this.pickups.count--; return; }
    }
    p.kind = kind; p.x = p.px = x + Math.cos(a) * rr; p.y = p.py = y + Math.sin(a) * rr; p.vx = p.vy = 0;
    p.value = value; p.age = 0; p.homing = false; p.alive = true;
  }

  // ------------------------------------------------------------------ tether behavior (barbed line)
  private stepTether(_dt: number): void {
    const b = this.behaviors.get('tetherDamage');
    if (!b) return;
    const s = this.ship, en = this.enemies.items, st = this.stats;
    for (const o of this.orbs) {
      const sp = Math.hypot(o.vx, o.vy);
      const base = hitDamage(sp, { ...st, critSpeed: 1e9 });
      if (base.damage <= 0) continue;
      const dmg = base.damage * b.damagePct;
      const dx = o.x - s.x, dy = o.y - s.y, seg2 = dx * dx + dy * dy;
      this.hash.query((s.x + o.x) / 2, (s.y + o.y) / 2, Math.sqrt(seg2) / 2 + 100, this.tmp2);
      const list = this.tmp2.slice();
      for (const idx of list) {
        const e = en[idx];
        if (!e.alive || e.tetherCd > 0 || e.invuln > 0) continue;
        let t = seg2 > 1e-9 ? ((e.x - s.x) * dx + (e.y - s.y) * dy) / seg2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.x + dx * t - e.x, py = s.y + dy * t - e.y, rr = e.radius + 2;
        if (px * px + py * py > rr * rr) continue;
        e.tetherCd = b.hitCooldownSec;
        this.secondary(e, dmg);
      }
    }
  }

  // ------------------------------------------------------------------ contact and ship damage (health.md)
  private hurtDmg = 0; private hurtX = 0; private hurtY = 0; private hurtSrc = '';
  /** Queue damage; the largest source this tick wins when stepContact resolves. Direct for blink (own tick). */
  hurtShip(dmg: number, x: number, y: number, src: string): void {
    if (dmg > this.hurtDmg) { this.hurtDmg = dmg; this.hurtX = x; this.hurtY = y; this.hurtSrc = src; }
  }

  private stepContact(): void {
    const s = this.ship, en = this.enemies.items;
    const thorns = this.behaviors.get('thorns');
    for (let k = 0; k < this.enemies.count; k++) {
      const e = en[k];
      if (!e.alive) continue;
      const dx = s.x - e.x, dy = s.y - e.y, rr = s.radius + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = dx / d, ny = dy / d;
      if (e.def.ai !== 'boss') { e.kx -= nx * 260; e.ky -= ny * 260; }
      if (thorns && e.thornsCd <= 0) {
        e.thornsCd = thorns.cooldownSec;
        this.events.push({ type: 'thorns', x: e.x, y: e.y });
        e.kx -= nx * thorns.knockback * (1 - (e.def.params.knockbackResist ?? 0)); e.ky -= ny * thorns.knockback * (1 - (e.def.params.knockbackResist ?? 0));
        this.secondary(e, thorns.damage * this.hpMul, -nx, -ny);
        if (!e.alive) continue;
      }
      this.hurtShip(e.def.contactDamage, s.x, s.y, e.def.name);
      this.hurtX = e.x; this.hurtY = e.y;
    }
    const dmg = this.hurtDmg;
    if (dmg > 0) {
      const ax = this.hurtX, ay = this.hurtY, src = this.hurtSrc;
      this.hurtDmg = 0;
      if (s.iframes <= 0 && !this.god) {
        s.hp -= dmg;
        s.iframes = this.stats.iframesSec;
        const dx = s.x - ax, dy = s.y - ay, d = Math.hypot(dx, dy) || 1;
        s.vx += (dx / d) * 220; s.vy += (dy / d) * 220;
        this.events.push({ type: 'playerHurt', x: s.x, y: s.y, hp: Math.max(0, s.hp), dmg, source: src });
        if (s.hp <= 0) { s.hp = 0; this.killedBy = src; this.events.push({ type: 'death', x: s.x, y: s.y }); this.finish('dead'); }
      }
    }
  }

  private finish(o: 'dead' | 'won'): void {
    // a win on the same tick as a death still counts as a win (kills resolve before contact)
    if (this.outcome === 'won') return;
    this.outcome = o; this.endTime = this.time; this.deadTime = 0;
    if (o === 'won') this.events.push({ type: 'victory' });
  }

  // ------------------------------------------------------------------ pickups / xp (xp.md)
  private addXp(v: number): void {
    this.xp += v * this.stats.xpGain;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpToNext(this.level);
      this.pendingDrafts++;
      this.events.push({ type: 'levelUp', level: this.level });
    }
  }

  private stepPickups(dt: number): void {
    const s = this.ship, st = this.stats, pk = this.pickups.items;
    for (let k = 0; k < this.pickups.count; k++) {
      const p = pk[k];
      const def = PICK_DEFS.get(p.kind)!;
      p.age += dt;
      const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
      const isHeart = p.kind === 'heart';
      if (!p.homing && d < st.pickupRadius && !(isHeart && s.hp >= s.maxHp)) p.homing = true;
      if (p.homing && isHeart && s.hp >= s.maxHp) p.homing = false;
      if (p.homing) {
        p.vx += (dx / d) * 2400 * dt; p.vy += (dy / d) * 2400 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 900) { p.vx *= 900 / sp; p.vy *= 900 / sp; }
      } else { p.vx *= 0.94; p.vy *= 0.94; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (d < s.radius + def.radius + 4 && !(isHeart && s.hp >= s.maxHp)) {
        p.alive = false;
        this.events.push({ type: 'pickup', x: p.x, y: p.y, kind: p.kind });
        switch (p.kind) {
          case 'xpSmall': case 'xpBig': this.addXp(p.value); break;
          case 'heart': s.hp = Math.min(s.maxHp, s.hp + p.value); this.events.push({ type: 'heal', x: s.x, y: s.y, amount: p.value }); break;
          case 'magnet': for (let j = 0; j < this.pickups.count; j++) { const q = pk[j]; if (q.kind === 'xpSmall' || q.kind === 'xpBig') q.homing = true; } break;
          case 'stardust': this.runPickups++; break;
          default:
        }
      } else if (def.lifetimeSec > 0 && p.age > def.lifetimeSec) p.alive = false;
    }
  }

  // ------------------------------------------------------------------ remaining behaviors
  private stepBehaviors(dt: number): void {
    if (this.shockCd > 0) this.shockCd -= dt;
    if (this.explodeCd > 0) this.explodeCd -= dt;
    const shock = this.behaviors.get('shockwaveOnReel');
    if (shock && this.tether.phase !== 'idle' && this.prevReel === false && this.tether.phase === 'reeling' && this.shockCd <= 0) {
      this.shockCd = shock.cooldownSec;
      const en = this.enemies.items;
      for (const o of this.orbs) {
        this.events.push({ type: 'shockwave', x: o.x, y: o.y, r: shock.radius });
        this.hash.query(o.x, o.y, shock.radius + 90, this.tmp2);
        const list = this.tmp2.slice();
        for (const idx of list) {
          const e = en[idx];
          if (!e.alive) continue;
          const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy);
          if (d > shock.radius + e.radius) continue;
          const resist = e.def.params.knockbackResist ?? 0, ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
          e.kx += ux * shock.knockback * (1 - resist); e.ky += uy * shock.knockback * (1 - resist);
          this.secondary(e, shock.damage * this.hpMul, ux, uy);
        }
      }
    }
    const mag = this.behaviors.get('magnetPulse');
    if (mag) {
      this.magnetT += dt;
      if (this.magnetT >= mag.intervalSec) {
        this.magnetT = 0;
        const pk = this.pickups.items, s = this.ship;
        for (let k = 0; k < this.pickups.count; k++) {
          const p = pk[k];
          if ((p.kind === 'xpSmall' || p.kind === 'xpBig') && Math.hypot(p.x - s.x, p.y - s.y) <= mag.radius) p.homing = true;
        }
        this.events.push({ type: 'behavior', id: 'magnetPulse' });
      }
    }
  }

  // ------------------------------------------------------------------ director (wave-director.md)
  /** Where a spawn lands: `dist` px from the ship at a random angle, retried inside the arena. */
  private spawnPoint(r: number, dist = DIRECTOR.spawnDistance, ang?: number): { x: number; y: number } {
    const s = this.ship;
    let a = ang ?? this.rngSpawn.range(0, TAU);
    const lim = ARENA_RADIUS - r - 4;
    for (let tries = 0; tries < DIRECTOR.spawnTries; tries++) {
      const x = s.x + Math.cos(a) * dist, y = s.y + Math.sin(a) * dist;
      if (Math.hypot(x, y) <= lim) return { x, y };
      a = this.rngSpawn.range(0, TAU);
    }
    const x = s.x + Math.cos(a) * dist, y = s.y + Math.sin(a) * dist, d = Math.hypot(x, y) || 1;
    return { x: (x / d) * lim, y: (y / d) * lim };
  }

  private canSpawn(): boolean { return this.enemies.count < DIRECTOR.hardEnemyCap; }

  private stepDirector(dt: number): void {
    if (this.noSpawn) return;
    const t = this.time, aw = waveAt(t);
    this.hpMul = aw.hpMul;
    if (this.stress > 0) {
      if (this.enemies.count < this.stress) {
        const kinds: AnyEnemyId[] = ['mite', 'mite', 'mite', 'dart', 'dart', 'wisp', 'wisp', 'blob', 'spitter', 'brute'];
        for (let i = 0; i < 12 && this.enemies.count < this.stress; i++) {
          const k = kinds[this.rngSpawn.int(kinds.length)], pt = this.spawnPoint(20);
          this.spawnEnemy(k, pt.x, pt.y);
        }
      }
      return;
    }
    // events
    for (let i = 0; i < EVENTS.length; i++) {
      const ev = EVENTS[i];
      if (ev.type === 'boss' && !this.warned[i] && t >= ev.atSec - DIRECTOR.bossWarningSec) {
        this.warned[i] = true;
        this.bossWarning = { boss: ev.enemy, at: t };
        this.events.push({ type: 'bossWarn', boss: ev.enemy });
      }
      if (this.fired[i] || t < ev.atSec) continue;
      this.fired[i] = true;
      if (ev.type === 'boss') {
        const pt = this.spawnPoint(this.def(ev.enemy).radius, 600);
        const b = this.spawnEnemy(ev.enemy, pt.x, pt.y);
        if (b) this.events.push({ type: 'bossSpawn', boss: ev.enemy, x: b.x, y: b.y });
        this.bossWarning = null;
      } else if (ev.type === 'swarmRing') {
        const a0 = this.rngSpawn.range(0, TAU);
        for (let j = 0; j < ev.count && this.canSpawn(); j++) {
          const a = a0 + (j / ev.count) * TAU;
          let x = this.ship.x + Math.cos(a) * DIRECTOR.ringRadius, y = this.ship.y + Math.sin(a) * DIRECTOR.ringRadius;
          const d = Math.hypot(x, y), lim = ARENA_RADIUS - 30;
          if (d > lim) { x *= lim / d; y *= lim / d; }
          this.spawnEnemy(ev.enemy, x, y);
        }
      } else {
        const dir = this.rngSpawn.range(0, TAU), spread = (DIRECTOR.rushSpreadDeg * Math.PI) / 180;
        for (let j = 0; j < ev.count; j++) {
          this.rush.push({ at: t + (j / ev.count) * DIRECTOR.rushDurationSec, enemy: ev.enemy, ang: dir + (this.rngSpawn.next() - 0.5) * spread });
        }
      }
    }
    for (let i = this.rush.length - 1; i >= 0; i--) {
      const r = this.rush[i];
      if (t < r.at) continue;
      this.rush.splice(i, 1);
      if (!this.canSpawn()) continue;
      const pt = this.spawnPoint(this.def(r.enemy).radius, DIRECTOR.spawnDistance, r.ang);
      this.spawnEnemy(r.enemy, pt.x, pt.y);
    }
    // boss leave rule (warden / hive warp out after bossLeaveAfterSec, no reward)
    for (let k = 0; k < this.enemies.count; k++) {
      const e = this.enemies.items[k];
      if (e.alive && e.def.ai === 'boss' && e.kind !== 'eclipse' && e.age >= DIRECTOR.bossLeaveAfterSec) { e.alive = false; this.events.push({ type: 'bossLeft', boss: e.kind }); }
    }
    // continuous spawns
    this.spawnAcc += aw.spawnPerSec * dt;
    let n = 0;
    while (this.spawnAcc >= 1 && this.enemies.count < aw.maxAlive && this.canSpawn() && n < 6) {
      this.spawnAcc -= 1; n++;
      const kind = pickMix(aw.wave, this.rngSpawn.next());
      const pt = this.spawnPoint(this.def(kind).radius);
      this.spawnEnemy(kind, pt.x, pt.y);
    }
    if (this.spawnAcc > 3) this.spawnAcc = 3;
  }

  private compact(): void {
    for (let k = this.enemies.count - 1; k >= 0; k--) if (!this.enemies.items[k].alive) this.enemies.release(k);
    for (let k = this.pickups.count - 1; k >= 0; k--) if (!this.pickups.items[k].alive) this.pickups.release(k);
    for (let k = this.projectiles.count - 1; k >= 0; k--) if (!this.projectiles.items[k].alive) this.projectiles.release(k);
  }

  // ------------------------------------------------------------------ draft (upgrade-draft.md)
  private toCard(u: UpgradeDef): DraftCard {
    return { id: u.id, name: u.name, description: u.description, rarity: u.rarity, stacks: this.stacks[u.id] ?? 0, maxStacks: u.maxStacks };
  }

  openDraft(): void {
    const ctx = { unlockedMeta: this.unlockedMeta, stacks: this.stacks, currentMods: this.mods, activeBehaviors: new Set(this.behaviors.keys()) };
    const elig = eligibleUpgrades(ctx);
    const picked = rollDraft(() => this.rngDraft.next(), elig);
    this.draftDefs = picked.slice();
    const cards = picked.map((u) => this.toCard(u));
    if (cards.length < PROGRESSION.upgradeChoices) {
      const fb = PROGRESSION.fallbackReward ?? { heal: 1, stardust: 10 };
      cards.push({ id: 'fieldRepair', name: 'Field Repair', description: `+${fb.heal} HP and +${fb.stardust} stardust.`, rarity: 'common', stacks: 0, maxStacks: 1, fallback: true });
      this.draftDefs.push(null);
    }
    this.draft = { cards, rerollsLeft: this.rerollsLeft, canReroll: this.rerollsLeft > 0 && elig.length > PROGRESSION.upgradeChoices };
    this.events.push({ type: 'draftOpen' });
  }

  rerollDraft(): boolean {
    if (!this.draft || !this.draft.canReroll) return false;
    this.rerollsLeft--;
    this.openDraft();
    return true;
  }

  pickDraft(index: number): boolean {
    const d = this.draft;
    if (!d || index < 0 || index >= d.cards.length) return false;
    const card = d.cards[index], def = this.draftDefs[index];
    this.draft = null; this.draftDefs = [];
    this.pendingDrafts = Math.max(0, this.pendingDrafts - 1);
    if (!def) {
      const fb = PROGRESSION.fallbackReward ?? { heal: 1, stardust: 10 };
      this.ship.hp = Math.min(this.ship.maxHp, this.ship.hp + fb.heal);
      this.bonusStardust += fb.stardust;
    } else this.applyUpgrade(def);
    this.events.push({ type: 'upgradePicked', id: card.id });
    return true;
  }

  private applyUpgrade(def: UpgradeDef): void {
    this.stacks[def.id] = (this.stacks[def.id] ?? 0) + 1;
    this.mods.push(...def.mods);
    if (def.behavior) { this.behaviors.set(def.behavior.id, def.behavior.params); this.events.push({ type: 'behavior', id: def.behavior.id }); }
    this.recomputeStats();
  }

  /** Add XP directly (dev params, tests). */
  grantXp(v: number): void { this.addXp(v); }

  /** Apply an upgrade directly (tests, debug cheats). Ignores locks; respects maxStacks. */
  grantUpgrade(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || (this.stacks[id] ?? 0) >= def.maxStacks) return false;
    this.applyUpgrade(def);
    return true;
  }

  // ------------------------------------------------------------------ summary / hash
  summary(): { secondsSurvived: number; bossKills: number; won: boolean; stardustPickups: number; stardustGain: number } {
    return { secondsSurvived: this.outcome ? this.endTime : this.time, bossKills: this.bossKills, won: this.outcome === 'won', stardustPickups: this.runPickups, stardustGain: this.stats.stardustGain };
  }
  /** Stardust banked for this run: formula (stardust.md) + Field Repair bonuses. */
  stardustEarned(): number { return runStardust(this.summary()) + this.bonusStardust; }

  activeBoss(): Enemy | null {
    for (let k = 0; k < this.enemies.count; k++) { const e = this.enemies.items[k]; if (e.alive && e.def.ai === 'boss') return e; }
    return null;
  }

  stateHash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      f64[0] = v === 0 ? 0 : v;
      h = Math.imul(h ^ u32[0], 0x01000193);
      h = Math.imul(h ^ u32[1], 0x01000193);
    };
    const s = this.ship, th = this.tether;
    mix(this.tick); mix(this.rngSpawn.state); mix(this.rngDraft.state); mix(this.rngDrops.state); mix(this.rngAi.state);
    mix(this.level); mix(this.xp); mix(this.kills); mix(this.outcome ? 1 : 0);
    mix(s.x); mix(s.y); mix(s.vx); mix(s.vy); mix(s.hp); mix(s.iframes);
    for (const o of this.orbs) { mix(o.x); mix(o.y); mix(o.vx); mix(o.vy); }
    mix(th.rest); mix(th.reelT);
    const en = this.enemies.items;
    for (let k = 0; k < this.enemies.count; k++) {
      const e = en[k];
      mix(e.id); mix(e.x); mix(e.y); mix(e.kx); mix(e.ky); mix(e.hp); mix(e.state); mix(e.timer); mix(e.hitCd0);
    }
    const mo = this.pickups.items;
    for (let k = 0; k < this.pickups.count; k++) { mix(mo[k].x); mix(mo[k].y); mix(mo[k].value); }
    const pr = this.projectiles.items;
    for (let k = 0; k < this.projectiles.count; k++) { mix(pr[k].x); mix(pr[k].y); }
    return h >>> 0;
  }

  /** Top orb speed (px/s, world frame) for UI/fx. */
  orbSpeed(): number { let m = 0; for (const o of this.orbs) m = Math.max(m, Math.hypot(o.vx, o.vy)); return m; }
  drainEvents(): GameEvent[] { const e = this.events.slice(); this.events.length = 0; return e; }
}

