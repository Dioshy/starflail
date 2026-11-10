// All world drawing. Uses Hue's art (src/render/art), particles (src/fx) and FEEL constants. Cosmetic randomness only.
import * as A from '../render/art';
import { FEEL } from '../fx/feel';
import { ParticleSystem } from '../fx/particles';
import { ARENA_RADIUS, PHYSICS } from '../data';
import type { World } from './sim';
import type { Enemy, GameEvent } from './types';
import { Rope } from './rope';

export interface Skins { ship: A.ShipSkin; orb: A.OrbSkin; trail: A.TrailId }
export interface RenderOpts { shake: boolean; reducedFlashes: boolean; damageNumbers: boolean }

interface Floater { x: number; y: number; text: string; kind: A.FloatKind; age: number; life: number; rise: number; alive: boolean }
interface Ring { x: number; y: number; r: number; age: number; life: number; color: string; alive: boolean }
interface Bolt { x1: number; y1: number; x2: number; y2: number; age: number; alive: boolean }

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;
const STATE: A.EnemyState[] = ['idle', 'telegraph', 'attack'];
const DANGER = '#ff4d5e';

function colorOf(kind: string): string {
  return (A.PALETTE.enemy as Record<string, string>)[kind] ?? (A.PALETTE.boss as Record<string, string>)[kind] ?? '#ffffff';
}

export class Renderer {
  camX = 0; camY = 0;
  skins: Skins = { ship: 'default', orb: 'default', trail: 'none' };
  opts: RenderOpts = { shake: true, reducedFlashes: false, damageNumbers: true };
  debug = false;
  readonly ps = new ParticleSystem(2000);
  private shakeAmp = 0; private shakeDecay = 10;
  private hurtFlash = 0; private critFlash = 0; private levelFlash = 0;
  private ropes = [new Rope(), new Rope(), new Rope()];
  private ropePts = new Float32Array(16);
  private trailPts = new Float32Array(2 * 20);
  private trailN = 0; private trailAcc = 0;
  private orbHist: number[][] = [[], [], []];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private t = 0;
  private fresh = true;
  intensity = 0;

  constructor() {
    for (let i = 0; i < 80; i++) this.floaters.push({ x: 0, y: 0, text: '', kind: 'dmg', age: 0, life: 1, rise: 30, alive: false });
    for (let i = 0; i < 24; i++) this.rings.push({ x: 0, y: 0, r: 100, age: 0, life: 0.3, color: '#fff', alive: false });
    for (let i = 0; i < 24; i++) this.bolts.push({ x1: 0, y1: 0, x2: 0, y2: 0, age: 0, alive: false });
  }

  /** New run: snap camera, clear transient fx. */
  reset(): void {
    this.fresh = true; this.ps.clear(); this.trailN = 0;
    for (const r of this.ropes) r.reset();
    for (const h of this.orbHist) h.length = 0;
    for (const f of this.floaters) f.alive = false;
    for (const r of this.rings) r.alive = false;
    for (const b of this.bolts) b.alive = false;
    this.shakeAmp = 0; this.hurtFlash = this.critFlash = this.levelFlash = 0;
  }

  private shake(k: { amp: number; decay: number }): void {
    if (!this.opts.shake) return;
    if (k.amp > this.shakeAmp) { this.shakeAmp = k.amp; this.shakeDecay = k.decay; }
  }
  private float(x: number, y: number, text: string, kind: A.FloatKind): void {
    for (const f of this.floaters) {
      if (f.alive) continue;
      const crit = kind === 'crit';
      f.x = x + (Math.random() - 0.5) * FEEL.damageNumber.jitterPx * 2; f.y = y - 14; f.text = text; f.kind = kind; f.age = 0; f.alive = true;
      f.life = (crit ? FEEL.damageNumber.critLifeMs : FEEL.damageNumber.lifeMs) / 1000;
      f.rise = crit ? FEEL.damageNumber.critRisePx : FEEL.damageNumber.risePx;
      return;
    }
  }
  private ring(x: number, y: number, r: number, life: number, color: string): void {
    for (const q of this.rings) if (!q.alive) { q.x = x; q.y = y; q.r = r; q.age = 0; q.life = life; q.color = color; q.alive = true; return; }
  }

  handleEvents(evs: GameEvent[], w: World): void {
    const ps = this.ps, R = Math.random;
    for (const e of evs) {
      switch (e.type) {
        case 'hit': {
          const ang = Math.atan2(e.ny, e.nx);
          if (e.bump) { ps.emit('spark', e.x, e.y, { angle: ang, color: '#9aa7c7', count: 3 }); break; }
          if (e.crit) { ps.emit('crit', e.x, e.y, { angle: ang }); this.shake(FEEL.shake.crit); if (!this.opts.reducedFlashes) this.critFlash = FEEL.flashMs.screenCrit / 1000; }
          else ps.emit('hit', e.x, e.y, { angle: ang, count: e.secondary ? 3 : 5 });
          if (e.boss) this.shake(FEEL.shake.bossHit);
          if (this.opts.damageNumbers && e.dmg > 0 && (e.crit || !e.secondary)) {
            this.float(e.x, e.y - 6, String(e.dmg) + (e.crit ? '!' : ''), e.crit ? 'crit' : 'dmg');
          }
          break;
        }
        case 'kill': {
          const col = colorOf(e.kind);
          if (!e.boss) { ps.emit('death', e.x, e.y, { color: col, count: e.kind === 'brute' ? 26 : 12 }); this.shake(FEEL.shake.kill); }
          break;
        }
        case 'bossDie':
          ps.emit('bossDeath', e.x, e.y, { color: colorOf(e.boss) });
          this.shake(FEEL.shake.bossDeath);
          break;
        case 'bossSpawn': this.ring(e.x, e.y, 220, 0.8, colorOf(e.boss)); this.shake(FEEL.shake.bossHit); break;
        case 'bossPhase': this.shake(FEEL.shake.bossHit); break;
        case 'bossStun': this.shake(FEEL.shake.crit); break;
        case 'playerHurt':
          ps.emit('playerHurt', e.x, e.y);
          this.shake(FEEL.shake.playerHurt);
          this.hurtFlash = FEEL.flashMs.playerHurt / 1000;
          break;
        case 'pickup': {
          const col = (A.PALETTE.pickup as Record<string, string>)[e.kind];
          if (e.kind === 'xpSmall') ps.emit('pickup', e.x, e.y, { color: col, count: 2 });
          else ps.emit('pickup', e.x, e.y, { color: col, count: e.kind === 'xpBig' ? 5 : 10 });
          break;
        }
        case 'heal':
          if (this.opts.damageNumbers) this.float(e.x, e.y - 20, `+${e.amount}`, 'heal');
          ps.emit('pickup', e.x, e.y, { color: '#ff7a9c', count: 8 });
          break;
        case 'levelUp':
          ps.emit('levelUp', w.ship.x, w.ship.y);
          this.shake(FEEL.shake.levelUp);
          if (!this.opts.reducedFlashes) this.levelFlash = FEEL.flashMs.levelUp / 1000;
          break;
        case 'shockwave': this.ring(e.x, e.y, e.r, 0.25, '#b36bff'); break;
        case 'explosion': this.ring(e.x, e.y, e.r, 0.3, '#ffb020'); this.shake(FEEL.shake.crit); break;
        case 'chain':
          for (const b of this.bolts) if (!b.alive) { b.x1 = e.x1; b.y1 = e.y1; b.x2 = e.x2; b.y2 = e.y2; b.age = 0; b.alive = true; break; }
          break;
        case 'thorns': ps.emit('spark', e.x, e.y, { color: '#6aa8ff', count: 6 }); break;
        case 'swat': ps.emit('spark', e.x, e.y, { color: '#ff3fa4', count: 4 }); break;
        case 'orbWall': ps.emit('spark', e.x, e.y, { color: '#9fefff', count: 6, speed: 1.2 }); break;
        case 'death': ps.emit('bossDeath', e.x, e.y, { color: A.PALETTE.player, count: 80 }); break;
        default:
      }
    }
    void R;
  }

  private stateOf(e: Enemy): A.EnemyState {
    if (e.def.ai === 'boss' && e.roar > 0) return 'telegraph';
    return STATE[e.state] ?? 'idle';
  }

  /** Telegraph lanes / zones: same visual language for every enemy (flash + a line or area showing where it goes). */
  private drawTelegraph(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number): void {
    if (e.state === 0) return;
    const P = e.def.params;
    const prog = e.state === 1 ? 1 - e.timer / e.telTotal : 1;
    // 4 Hz normally; with Reduced Flashes the lane stays steady (no strobe at all, B5)
    const flash = !this.opts.reducedFlashes && Math.floor(this.t * 8) % 2 === 0;
    c.save();
    c.lineCap = 'round';
    const col = flash && e.state === 1 ? '#ffffff' : DANGER;
    const lane = (len: number, width: number): void => {
      c.globalAlpha = 0.12 + prog * 0.35; c.strokeStyle = col; c.lineWidth = width;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + e.dirX * len, y + e.dirY * len); c.stroke();
      c.globalAlpha = 0.5 + prog * 0.4; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + e.dirX * len, y + e.dirY * len); c.stroke();
    };
    switch (e.kind) {
      case 'dart': if (e.state === 1) lane(P.dashSpeed * P.dashSec, 4 + prog * 8); break;
      case 'wisp': if (e.state === 1) lane(P.lungeSpeed * P.lungeSec, 3 + prog * 6); break;
      case 'brute': if (e.state === 1) lane(P.chargeSpeed * P.chargeSec, e.radius * 2 * (0.4 + prog * 0.6)); break;
      case 'spitter': if (e.state === 1) { c.globalAlpha = 0.4 + prog * 0.5; c.strokeStyle = '#ff3fa4'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + e.dirX * 20, y + e.dirY * 20); c.lineTo(x + e.dirX * (50 + prog * 40), y + e.dirY * (50 + prog * 40)); c.stroke(); } break;
      case 'warden':
        if (e.pat === 1 && e.state === 1) lane(P.chargeSpeed * P.chargeSec, 56);
        else if (e.pat === 0 && e.state === 1) {
          const n = e.phase2 ? P.phase2RingCount : P.ringCount;
          c.globalAlpha = 0.3 + prog * 0.6; c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r0 = e.radius + 8, r1 = e.radius + 30 + prog * 30; c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); }
          c.stroke();
        }
        break;
      case 'hive':
        if (e.pat === 1 && e.state === 1) {
          const half = (P.volleySpreadDeg * Math.PI) / 360, a0 = Math.atan2(e.dirY, e.dirX);
          c.globalAlpha = 0.1 + prog * 0.3; c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.arc(x, y, 420, a0 - half, a0 + half); c.closePath(); c.fill();
        }
        break;
      case 'eclipse':
        if (e.pat === 0 && e.state === 1) {
          c.globalAlpha = 0.1 + prog * 0.35; c.strokeStyle = '#c07bff'; c.lineWidth = 3; c.beginPath();
          for (let i = 0; i < P.spiralArms; i++) { const a = Math.atan2(e.dirY, e.dirX) + (i / P.spiralArms) * TAU; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 520, y + Math.sin(a) * 520); }
          c.stroke();
        } else if (e.pat === 1 && e.state === 1) {
          c.globalAlpha = 0.18 + prog * 0.3; c.fillStyle = '#1a0630'; c.beginPath(); c.arc(e.tx, e.ty, P.blinkRadius, 0, TAU); c.fill();
          c.globalAlpha = 0.9; c.strokeStyle = flash ? '#ffffff' : '#c07bff'; c.lineWidth = 3; c.beginPath(); c.arc(e.tx, e.ty, P.blinkRadius, 0, TAU); c.stroke();
          c.globalAlpha = 0.9; c.beginPath(); c.arc(e.tx, e.ty, P.blinkRadius * (1 - prog), 0, TAU); c.stroke();
        } else if (e.pat === 2) {
          c.globalAlpha = 0.08 + 0.12 * Math.sin(this.t * 10) ** 2; c.strokeStyle = '#c07bff'; c.lineWidth = 6; c.beginPath(); c.arc(x, y, P.wellRadius * (e.state === 1 ? 0.5 + 0.5 * prog : 1), 0, TAU); c.stroke();
        }
        break;
      default:
    }
    c.restore();
  }

  /** Title / hangar backdrop. */
  drawMenu(c: CanvasRenderingContext2D, w: number, h: number, dt: number, mode: 'title' | 'hangar' | 'results', loadout?: { ship: string; orb: string; shipSkin: A.ShipSkin; orbSkin: A.OrbSkin }): void {
    this.t += dt;
    const t = this.t;
    A.drawBackground(c, w, h, t * 30, t * 12, t, 0.35);
    if (mode === 'title') {
      A.drawLogo(c, w / 2, Math.min(h * 0.3, 260), Math.min(1.5, w / 700), t);
    } else if (mode === 'hangar' && loadout) {
      const wide = w >= 900;
      const cx = wide ? w * 0.74 : w * 0.5, cy = wide ? h * 0.5 : h * 0.15;
      const a = t * 1.6, L = 110;
      const ox = cx + Math.cos(a) * L, oy = cy + Math.sin(a) * L;
      const n = 8, pts = this.ropePts;
      for (let i = 0; i < n; i++) { const f = i / (n - 1); pts[i * 2] = lerp(cx, ox, f); pts[i * 2 + 1] = lerp(cy, oy, f); }
      A.drawTether(c, pts.subarray(0, n * 2), 0.5, false, loadout.orbSkin, t);
      A.drawOrb(c, ox, oy, 18, 0.6 + 0.3 * Math.sin(t), loadout.orbSkin, t);
      A.drawShip(c, cx, cy, a + Math.PI / 2, 22, loadout.shipSkin, t, 0);
    }
  }

  draw(c: CanvasRenderingContext2D, w: World, alpha: number, dt: number, sw: number, sh: number): void {
    this.t += dt;
    const t = this.t, st = w.stats, s = w.ship;
    const sx = lerp(s.px, s.x, alpha), sy = lerp(s.py, s.y, alpha);
    const tx = sx + s.vx * 0.2, ty = sy + s.vy * 0.2;
    if (this.fresh) { this.camX = tx; this.camY = ty; this.fresh = false; }
    const k = 1 - Math.exp(-6 * dt);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    this.shakeAmp *= Math.exp(-this.shakeDecay * dt);
    if (this.shakeAmp < 0.05) this.shakeAmp = 0;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.critFlash = Math.max(0, this.critFlash - dt);
    this.levelFlash = Math.max(0, this.levelFlash - dt);
    const camX = this.camX + (Math.random() - 0.5) * 2 * this.shakeAmp;
    const camY = this.camY + (Math.random() - 0.5) * 2 * this.shakeAmp;

    A.drawBackground(c, sw, sh, camX, camY, t, this.intensity);
    c.save();
    c.translate(sw / 2 - camX, sh / 2 - camY);
    const vx0 = camX - sw / 2 - 40, vx1 = camX + sw / 2 + 40, vy0 = camY - sh / 2 - 40, vy1 = camY + sh / 2 + 40;
    if (Math.hypot(camX, camY) + Math.hypot(sw, sh) / 2 > ARENA_RADIUS - 30) A.drawArenaBounds(c, 0, 0, ARENA_RADIUS, t);

    // pickups
    const pk = w.pickups;
    for (let i = 0; i < pk.count; i++) {
      const p = pk.items[i];
      const x = lerp(p.px, p.x, alpha), y = lerp(p.py, p.y, alpha);
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      A.drawPickup(c, p.kind, x, y, t);
    }

    // enemies (bosses last so they sit on top)
    const en = w.enemies;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < en.count; i++) {
        const e = en.items[i];
        if (!e.alive || (e.def.ai === 'boss') !== (pass === 1)) continue;
        const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha);
        const m = e.radius + (e.def.ai === 'boss' ? 760 : 60);
        if (x < vx0 - m || x > vx1 + m || y < vy0 - m || y > vy1 + m) continue;
        this.drawTelegraph(c, e, x, y);
        const hit = e.flash > 0 ? Math.min(1, e.flash / (FEEL.flashMs.enemyHit / 1000)) : 0;
        const inv = e.invuln > 0 ? 0.6 : 0;
        A.drawEnemy(c, e.kind, x, y, e.radius, e.ang, t, Math.max(hit, inv), this.stateOf(e));
        if (e.stun > 0) A.drawFloatingText(c, 'STUNNED', x, y - e.radius - 24, 1, 'info');
      }
    }

    // projectiles
    const pr = w.projectiles;
    for (let i = 0; i < pr.count; i++) {
      const p = pr.items[i];
      const x = lerp(p.px, p.x, alpha), y = lerp(p.py, p.y, alpha);
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      A.drawProjectile(c, p.kind, x, y, p.r, t);
    }

    // slow field disc (Gravity Reel)
    const sf = w.behaviors.get('slowField');
    if (sf && (!sf.onlyWhileReeling || w.tether.phase === 'reeling' || w.tether.phase === 'held')) {
      for (const o of w.orbs) { c.save(); c.globalAlpha = 0.18 + 0.06 * Math.sin(t * 12); A.drawGlow(c, o.x, o.y, sf.radius, '#b36bff', 0.9); c.restore(); }
    }

    // tether(s), ship trail, orbs, ship
    const dtc = Math.min(dt, 0.05);
    const reeling = w.tether.phase === 'reeling' || w.tether.phase === 'held';
    const speed = w.orbSpeed();
    const speed01 = Math.min(1, speed / st.critSpeed);
    for (let oi = 0; oi < w.orbs.length; oi++) {
      const o = w.orbs[oi];
      const ox = lerp(o.px, o.x, alpha), oy = lerp(o.py, o.y, alpha);
      const Li = st.tetherLength * (1 - 0.2 * oi);
      const dist = Math.hypot(ox - sx, oy - sy);
      const rope = this.ropes[oi];
      rope.update(sx, sy, ox, oy, Math.min(Li * 1.05, Math.max(dist, 10) * 1.02 + 6), dtc);
      const pts = this.ropePts;
      for (let i = 0; i < rope.n; i++) { pts[i * 2] = rope.x[i]; pts[i * 2 + 1] = rope.y[i]; }
      const tension = Math.min(1, Math.max(0, (dist - Li) / (Li * (PHYSICS.maxStretchRatio - 1))));
      A.drawTether(c, pts.subarray(0, rope.n * 2), Math.max(tension, reeling ? 0.6 : 0), reeling, this.skins.orb, t);
      // short motion streak so a fast orb reads as fast
      const hist = this.orbHist[oi];
      hist.push(ox, oy); if (hist.length > 14) hist.splice(0, 2);
      if (speed >= st.minDamageSpeed * 0.8 && hist.length >= 4) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        for (let i = 2; i < hist.length; i += 2) {
          const f = i / hist.length;
          c.globalAlpha = f * (speed01 >= 1 ? 0.6 : 0.35); c.strokeStyle = speed01 >= 1 ? '#ffd166' : A.PALETTE.player; c.lineWidth = o.radius * 1.5 * f;
          c.beginPath(); c.moveTo(hist[i - 2], hist[i - 1]); c.lineTo(hist[i], hist[i + 1]); c.stroke();
        }
        c.restore();
      }
    }
    // ship trail (cosmetic)
    if (this.skins.trail !== 'none') {
      this.trailAcc += dt;
      if (this.trailAcc > 0.016) {
        this.trailAcc = 0;
        const n = 20, tp = this.trailPts;
        if (this.trailN < n) this.trailN++;
        for (let i = 0; i < (this.trailN - 1) * 2; i++) tp[i] = tp[i + 2];
        tp[(this.trailN - 1) * 2] = sx; tp[(this.trailN - 1) * 2 + 1] = sy;
      }
      if (this.trailN > 2) A.drawTrail(c, this.trailPts.subarray(0, this.trailN * 2), this.skins.trail, t);
    }
    for (let oi = 0; oi < w.orbs.length; oi++) {
      const o = w.orbs[oi];
      A.drawOrb(c, lerp(o.px, o.x, alpha), lerp(o.py, o.y, alpha), o.radius, Math.min(1, Math.hypot(o.vx, o.vy) / st.critSpeed), this.skins.orb, t);
    }
    if (w.outcome !== 'dead') {
      const hurt = s.iframes > 0 ? (Math.floor(t * 10) % 2 === 0 ? 1 : 0.2) : 0;
      A.drawShip(c, sx, sy, s.aim, s.radius + 3, this.skins.ship, t, hurt);
    }

    // behavior fx
    this.ps.update(dt);
    this.ps.draw(c);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.age += dt; if (r.age >= r.life) { r.alive = false; continue; }
      const f = r.age / r.life;
      c.globalAlpha = 1 - f; c.strokeStyle = r.color; c.lineWidth = 6 * (1 - f) + 1;
      c.beginPath(); c.arc(r.x, r.y, r.r * (0.3 + 0.7 * f), 0, TAU); c.stroke();
    }
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.age += dt; if (b.age > 0.08) { b.alive = false; continue; }
      c.globalAlpha = 1 - b.age / 0.08; c.strokeStyle = A.PALETTE.player; c.lineWidth = 3; c.beginPath(); c.moveTo(b.x1, b.y1);
      const mx = (b.x1 + b.x2) / 2 + (Math.random() - 0.5) * 24, my = (b.y1 + b.y2) / 2 + (Math.random() - 0.5) * 24;
      c.lineTo(mx, my); c.lineTo(b.x2, b.y2); c.stroke();
    }
    c.restore();

    // floating text
    for (const f of this.floaters) {
      if (!f.alive) continue;
      f.age += dt;
      if (f.age >= f.life) { f.alive = false; continue; }
      if (!f.text) continue;
      const p = f.age / f.life;
      A.drawFloatingText(c, f.text, f.x, f.y - f.rise * (1 - (1 - p) * (1 - p)), 1 - p * p, f.kind);
    }
    if (this.debug) this.drawHitboxes(c, w);
    c.restore();

    // screen flashes (skipped when "reduced flashes" is on, except a gentle hurt vignette)
    if (this.hurtFlash > 0) {
      const f = this.hurtFlash / (FEEL.flashMs.playerHurt / 1000) * (this.opts.reducedFlashes ? 0.25 : 0.55);
      const g = c.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.3, sw / 2, sh / 2, Math.hypot(sw, sh) * 0.55);
      g.addColorStop(0, 'rgba(255,40,80,0)'); g.addColorStop(1, `rgba(255,40,80,${f})`);
      c.fillStyle = g; c.fillRect(0, 0, sw, sh);
    }
    if (this.critFlash > 0) { c.fillStyle = `rgba(255,240,200,${0.07 * this.critFlash / (FEEL.flashMs.screenCrit / 1000)})`; c.fillRect(0, 0, sw, sh); }
    if (this.levelFlash > 0) { c.fillStyle = `rgba(53,230,255,${0.12 * this.levelFlash / (FEEL.flashMs.levelUp / 1000)})`; c.fillRect(0, 0, sw, sh); }
  }

  private drawHitboxes(c: CanvasRenderingContext2D, w: World): void {
    c.lineWidth = 1; c.strokeStyle = '#00ff66';
    c.beginPath();
    for (let i = 0; i < w.enemies.count; i++) { const e = w.enemies.items[i]; c.moveTo(e.x + e.radius, e.y); c.arc(e.x, e.y, e.radius, 0, TAU); }
    for (const o of w.orbs) { c.moveTo(o.x + o.radius, o.y); c.arc(o.x, o.y, o.radius, 0, TAU); }
    c.moveTo(w.ship.x + w.ship.radius, w.ship.y); c.arc(w.ship.x, w.ship.y, w.ship.radius, 0, TAU);
    c.stroke();
  }
}
