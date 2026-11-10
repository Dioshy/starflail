import { LOGICAL_H, LOGICAL_W } from '../core/canvas';
import { Rng } from '../core/rng';
import type { Enemy, GameEvent } from './types';
import type { World } from './sim';
import { Rope } from './rope';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; ring: boolean; alive: boolean }

const COL = { mite: '#ff4f7b', dart: '#ffd23f', brute: '#b86bff' } as const;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** All world drawing lives here (circles + lines) so it can be swapped for real art later. */
export class Renderer {
  camX = 0; camY = 0;
  trauma = 0;
  hurtFlash = 0;
  private rng = new Rng(0xc0ffee); // cosmetic stream, never touches the sim RNG
  private parts: Particle[] = [];
  private rope = new Rope();
  private trail: number[] = [];
  private lastRun = -1;
  private t = 0;
  debug = false;

  constructor() {
    for (let i = 0; i < 600; i++) this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', ring: false, alive: false });
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, ring = false): void {
    for (const p of this.parts) {
      if (p.alive) continue;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.color = color; p.ring = ring; p.alive = true;
      return;
    }
  }

  handleEvents(evs: GameEvent[], w: World): void {
    const fx = w.T.fx, r = this.rng;
    for (const e of evs) {
      switch (e.type) {
        case 'hit': {
          this.trauma = Math.min(1, this.trauma + fx.shakeHit);
          const n = e.crit ? 10 : 5;
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(e.ny, e.nx) + r.range(-0.9, 0.9), s = r.range(150, 520);
            this.spawn(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, r.range(0.15, 0.4), r.range(1.5, 3.2), e.crit ? '#ffd9a0' : '#ffffff');
          }
          break;
        }
        case 'crit':
          this.trauma = Math.min(1, this.trauma + fx.shakeCrit);
          this.spawn(e.x, e.y, 0, 0, 0.3, 16, '#ffb347', true);
          break;
        case 'kill': {
          const col = COL[e.kind], n = e.kind === 'brute' ? 26 : 12;
          for (let i = 0; i < n; i++) {
            const a = r.range(0, Math.PI * 2), s = r.range(60, 380);
            this.spawn(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, r.range(0.3, 0.7), r.range(2, 4.5), col);
          }
          this.spawn(e.x, e.y, 0, 0, 0.35, e.kind === 'brute' ? 30 : 14, col, true);
          if (e.kind === 'brute') this.trauma = Math.min(1, this.trauma + 0.4);
          break;
        }
        case 'playerHurt':
          this.trauma = Math.min(1, this.trauma + fx.shakeHurt);
          this.hurtFlash = 1;
          for (let i = 0; i < 16; i++) { const a = r.range(0, 6.283), s = r.range(100, 400); this.spawn(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, 0.5, 3, '#ff3d6e'); }
          break;
        case 'pickup':
          this.spawn(e.x, e.y, 0, 0, 0.18, 8, '#35f2c4', true);
          break;
        case 'levelUp':
          this.spawn(w.ship.x, w.ship.y, 0, 0, 0.6, 70, '#35f2c4', true);
          break;
        case 'death':
          this.trauma = 1;
          for (let i = 0; i < 40; i++) { const a = r.range(0, 6.283), s = r.range(80, 600); this.spawn(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, 0.9, r.range(2, 5), '#ff3d6e'); }
          break;
      }
    }
  }

  draw(c: CanvasRenderingContext2D, w: World, alpha: number, dt: number): void {
    this.t += dt;
    const T = w.T, s = w.ship, o = w.orb;
    const sx = lerp(s.px, s.x, alpha), sy = lerp(s.py, s.y, alpha);
    const ox = lerp(o.px, o.x, alpha), oy = lerp(o.py, o.y, alpha);

    // camera with lookahead
    const tx = sx + s.vx * 0.25, ty = sy + s.vy * 0.25;
    if (this.lastRun !== w.runIndex) { this.camX = tx; this.camY = ty; this.lastRun = w.runIndex; this.rope.reset(); this.trail.length = 0; }
    const k = 1 - Math.exp(-6 * dt);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    const sh = this.trauma * this.trauma * 16;
    const camX = this.camX + (this.rng.next() - 0.5) * 2 * sh;
    const camY = this.camY + (this.rng.next() - 0.5) * 2 * sh;

    c.fillStyle = '#05060f';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.save();
    c.translate(LOGICAL_W / 2 - camX, LOGICAL_H / 2 - camY);
    const vx0 = camX - LOGICAL_W / 2 - 40, vx1 = camX + LOGICAL_W / 2 + 40;
    const vy0 = camY - LOGICAL_H / 2 - 40, vy1 = camY + LOGICAL_H / 2 + 40;

    // grid
    c.lineWidth = 1; c.strokeStyle = 'rgba(70,90,180,0.16)'; c.beginPath();
    for (let gx = Math.floor(vx0 / 100) * 100; gx <= vx1; gx += 100) { c.moveTo(gx, vy0); c.lineTo(gx, vy1); }
    for (let gy = Math.floor(vy0 / 100) * 100; gy <= vy1; gy += 100) { c.moveTo(vx0, gy); c.lineTo(vx1, gy); }
    c.stroke();

    // out-of-arena dim + boundary
    c.beginPath(); c.rect(vx0 - 10, vy0 - 10, vx1 - vx0 + 20, vy1 - vy0 + 20); c.arc(0, 0, T.arenaRadius, 0, Math.PI * 2, true);
    c.fillStyle = 'rgba(2,2,8,0.85)'; c.fill('evenodd');
    c.beginPath(); c.arc(0, 0, T.arenaRadius, 0, Math.PI * 2);
    c.lineWidth = 10; c.strokeStyle = 'rgba(40,140,255,0.18)'; c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#3aa0ff'; c.stroke();

    c.globalCompositeOperation = 'lighter';

    // motes
    c.fillStyle = '#35f2c4';
    for (let i = 0; i < w.motes.count; i++) {
      const m = w.motes.items[i];
      const x = lerp(m.px, m.x, alpha), y = lerp(m.py, m.y, alpha);
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const r = 3 + m.value * 0.6;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // enemies
    for (let i = 0; i < w.enemies.count; i++) {
      const e = w.enemies.items[i];
      const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha);
      if (x < vx0 - 30 || x > vx1 + 30 || y < vy0 - 30 || y > vy1 + 30) continue;
      this.drawEnemy(c, e, x, y);
    }

    // rope (visual verlet)
    const dist = Math.hypot(ox - sx, oy - sy);
    this.rope.update(sx, sy, ox, oy, Math.min(T.tetherLength * 1.05, Math.max(dist, 10) * 1.02 + 6), Math.min(dt, 0.05));
    const speed = w.orbSpeed();
    const heat = Math.min(1, Math.max(0, (speed - T.minDamageSpeed * 0.6) / (T.critSpeed - T.minDamageSpeed * 0.6)));
    const dangerous = speed >= T.minDamageSpeed, crit = speed >= T.critSpeed;
    const tension = Math.min(1, Math.max(0, (dist - T.tetherLength) / (T.tetherLength * (T.maxStretch - 1))));
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(this.rope.x[0], this.rope.y[0]);
    for (let i = 1; i < this.rope.n; i++) c.lineTo(this.rope.x[i], this.rope.y[i]);
    c.lineWidth = 6 + tension * 3; c.strokeStyle = `rgba(80,200,255,${0.15 + tension * 0.2})`; c.stroke();
    c.lineWidth = 2.5; c.strokeStyle = `rgba(${150 + tension * 105},${230 - tension * 40},255,0.95)`; c.stroke();

    // orb trail
    const tr = this.trail;
    tr.push(ox, oy);
    if (tr.length > 20) tr.splice(0, 2);
    for (let i = 2; i < tr.length; i += 2) {
      const f = i / tr.length;
      c.beginPath(); c.moveTo(tr[i - 2], tr[i - 1]); c.lineTo(tr[i], tr[i + 1]);
      c.lineWidth = o.radius * 1.6 * f; c.strokeStyle = crit ? `rgba(255,170,70,${f * 0.6})` : dangerous ? `rgba(120,230,255,${f * 0.5})` : `rgba(80,100,200,${f * 0.35})`;
      c.stroke();
    }

    // orb
    c.shadowBlur = 8 + heat * 30; c.shadowColor = crit ? '#ffb347' : dangerous ? '#7ee8ff' : '#4a5acd';
    c.beginPath(); c.arc(ox, oy, o.radius * (1 + heat * 0.25), 0, Math.PI * 2);
    c.fillStyle = crit ? '#ffd9a0' : dangerous ? '#c8f6ff' : '#6677dd'; c.fill();
    c.lineWidth = 3; c.strokeStyle = crit ? '#ff8a2a' : dangerous ? '#3fd0ff' : '#33408a'; c.stroke();
    c.shadowBlur = 0;

    // ship
    const blink = s.iframes > 0 && Math.floor(this.t * 20) % 2 === 0;
    if (!w.dead && !blink) {
      c.save(); c.translate(sx, sy); c.rotate(s.aim);
      c.shadowBlur = 14; c.shadowColor = '#35f2c4';
      c.beginPath(); c.moveTo(s.radius * 1.3, 0); c.lineTo(-s.radius, s.radius * 0.9); c.lineTo(-s.radius * 0.5, 0); c.lineTo(-s.radius, -s.radius * 0.9); c.closePath();
      c.fillStyle = 'rgba(53,242,196,0.35)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#7dffe0'; c.stroke();
      c.restore(); c.shadowBlur = 0;
    }

    // particles
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const f = p.life / p.max;
      if (p.ring) {
        c.beginPath(); c.arc(p.x, p.y, p.size * (2 - f), 0, Math.PI * 2);
        c.lineWidth = 3 * f + 0.5; c.strokeStyle = p.color; c.globalAlpha = f; c.stroke();
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
        c.globalAlpha = f; c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    c.globalAlpha = 1;

    if (this.debug) this.drawHitboxes(c, w);
    c.globalCompositeOperation = 'source-over';
    c.restore();

    if (this.hurtFlash > 0) {
      const g = c.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, 200, LOGICAL_W / 2, LOGICAL_H / 2, 760);
      g.addColorStop(0, 'rgba(255,40,80,0)'); g.addColorStop(1, `rgba(255,40,80,${this.hurtFlash * 0.5})`);
      c.fillStyle = g; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }
  }

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number): void {
    const flash = e.flash > 0;
    const col = flash ? '#ffffff' : COL[e.kind];
    c.lineWidth = 2.5; c.strokeStyle = col;
    c.fillStyle = flash ? 'rgba(255,255,255,0.85)' : e.kind === 'brute' ? 'rgba(184,107,255,0.3)' : e.kind === 'dart' ? 'rgba(255,210,63,0.25)' : 'rgba(255,79,123,0.3)';
    if (e.kind === 'dart') {
      const a = Math.atan2(e.dirY, e.dirX);
      const tel = e.state === 1;
      if (tel) {
        const f = 1 - e.timer / 0.7;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + e.dirX * 380, y + e.dirY * 380);
        c.lineWidth = 2 + f * 6; c.strokeStyle = `rgba(255,${Math.floor(210 - f * 120)},60,${0.15 + f * 0.6})`; c.stroke();
        c.lineWidth = 2.5; c.strokeStyle = col;
      }
      c.save(); c.translate(x, y); c.rotate(a);
      const r = e.radius * (tel ? 1.15 : 1);
      c.beginPath(); c.moveTo(r * 1.5, 0); c.lineTo(-r, r * 0.9); c.lineTo(-r, -r * 0.9); c.closePath();
      c.fill(); c.stroke(); c.restore();
    } else {
      c.beginPath(); c.arc(x, y, e.radius, 0, Math.PI * 2); c.fill(); c.stroke();
      if (e.kind === 'brute') { c.beginPath(); c.arc(x, y, e.radius * 0.55, 0, Math.PI * 2); c.stroke(); }
    }
  }

  private drawHitboxes(c: CanvasRenderingContext2D, w: World): void {
    c.lineWidth = 1; c.strokeStyle = '#00ff66';
    c.beginPath();
    for (let i = 0; i < w.enemies.count; i++) { const e = w.enemies.items[i]; c.moveTo(e.x + e.radius, e.y); c.arc(e.x, e.y, e.radius, 0, Math.PI * 2); }
    c.moveTo(w.orb.x + w.orb.radius, w.orb.y); c.arc(w.orb.x, w.orb.y, w.orb.radius, 0, Math.PI * 2);
    c.moveTo(w.ship.x + w.ship.radius, w.ship.y); c.arc(w.ship.x, w.ship.y, w.ship.radius, 0, Math.PI * 2);
    c.stroke();
  }
}
