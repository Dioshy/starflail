export type FxKind = 'hit' | 'crit' | 'death' | 'bossDeath' | 'pickup' | 'levelUp' | 'spark' | 'playerHurt';
export interface EmitOpts { angle?: number; speed?: number; color?: string; count?: number }

const SQUARE = 0, STREAK = 1, RING = 2;
const TAU = Math.PI * 2;

/** Pooled particle system. Typed arrays, swap-remove, zero allocation in update/draw. */
export class ParticleSystem {
  private n = 0;
  private readonly max: number;
  private x: Float32Array; private y: Float32Array; private vx: Float32Array; private vy: Float32Array;
  private life: Float32Array; private maxLife: Float32Array; private size: Float32Array; private drag: Float32Array;
  private shape: Uint8Array; private col: Uint16Array;
  private colors: string[] = [];
  private colorIdx = new Map<string, number>();

  constructor(max = 2000) {
    this.max = max;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.drag = new Float32Array(max);
    this.shape = new Uint8Array(max); this.col = new Uint16Array(max);
  }

  get count(): number { return this.n; }
  clear(): void { this.n = 0; }

  private ci(c: string): number {
    let i = this.colorIdx.get(c);
    if (i === undefined) { i = this.colors.length; this.colors.push(c); this.colorIdx.set(c, i); }
    return i;
  }

  private add(x: number, y: number, ang: number, spd: number, life: number, size: number, shape: number, col: number, drag: number): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = Math.cos(ang) * spd; this.vy[i] = Math.sin(ang) * spd;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
    this.shape[i] = shape; this.col[i] = col; this.drag[i] = drag;
  }

  emit(kind: FxKind, x: number, y: number, opts: EmitOpts = {}): void {
    const R = Math.random;
    const base = opts.angle;
    const sp = opts.speed ?? 1;
    const W = this.ci('#ffffff');
    switch (kind) {
      case 'hit': {
        const c = this.ci(opts.color ?? '#fff2b0'), n = opts.count ?? 6;
        for (let i = 0; i < n; i++) this.add(x, y, (base ?? R() * TAU) + (R() - 0.5) * 1.4, (150 + R() * 250) * sp, 0.16 + R() * 0.12, 2 + R() * 2, STREAK, i & 1 ? W : c, 5);
        break;
      }
      case 'crit': {
        const c = this.ci(opts.color ?? '#ffd166'), n = opts.count ?? 14;
        for (let i = 0; i < n; i++) this.add(x, y, (base ?? R() * TAU) + (R() - 0.5) * 2.2, (200 + R() * 380) * sp, 0.2 + R() * 0.2, 2.5 + R() * 2.5, STREAK, i % 3 ? c : W, 4);
        this.add(x, y, 0, 0, 0.22, 34, RING, c, 0);
        break;
      }
      case 'death': {
        const c = this.ci(opts.color ?? '#ff4d5e'), n = opts.count ?? 16;
        for (let i = 0; i < n; i++) this.add(x, y, R() * TAU, (60 + R() * 220) * sp, 0.3 + R() * 0.35, 2 + R() * 3.5, SQUARE, i % 4 ? c : W, 3);
        this.add(x, y, 0, 0, 0.3, 26, RING, c, 0);
        break;
      }
      case 'bossDeath': {
        const c = this.ci(opts.color ?? '#ffb020'), c2 = this.ci('#ff4d5e'), n = opts.count ?? 140;
        for (let i = 0; i < n; i++) this.add(x, y, R() * TAU, (80 + R() * 520) * sp, 0.6 + R() * 0.9, 2 + R() * 5, i % 5 === 0 ? STREAK : SQUARE, i % 3 === 0 ? W : i % 3 === 1 ? c : c2, 2);
        for (let i = 0; i < 4; i++) this.add(x, y, 0, 0, 0.5 + i * 0.18, 90 + i * 70, RING, i & 1 ? c : W, 0);
        break;
      }
      case 'pickup': {
        const c = this.ci(opts.color ?? '#4dffc4'), n = opts.count ?? 8;
        for (let i = 0; i < n; i++) this.add(x, y, -1.57 + (R() - 0.5) * 2.4, (50 + R() * 110) * sp, 0.25 + R() * 0.2, 1.5 + R() * 2, SQUARE, c, 3);
        this.add(x, y, 0, 0, 0.2, 16, RING, c, 0);
        break;
      }
      case 'levelUp': {
        const c = this.ci(opts.color ?? '#35e6ff'), g = this.ci('#ffd166'), n = opts.count ?? 36;
        for (let i = 0; i < n; i++) this.add(x + (R() - 0.5) * 30, y, -1.57 + (R() - 0.5) * 1.2, (80 + R() * 240) * sp, 0.6 + R() * 0.6, 2 + R() * 3, SQUARE, i & 1 ? c : g, 1.5);
        this.add(x, y, 0, 0, 0.5, 80, RING, c, 0); this.add(x, y, 0, 0, 0.7, 120, RING, W, 0);
        break;
      }
      case 'spark': {
        const c = this.ci(opts.color ?? '#9fefff'), n = opts.count ?? 2;
        for (let i = 0; i < n; i++) this.add(x, y, (base ?? R() * TAU) + (R() - 0.5), (40 + R() * 90) * sp, 0.18 + R() * 0.2, 1.5 + R() * 1.5, SQUARE, c, 4);
        break;
      }
      case 'playerHurt': {
        const c = this.ci(opts.color ?? '#ff4d5e'), n = opts.count ?? 18;
        for (let i = 0; i < n; i++) this.add(x, y, R() * TAU, (120 + R() * 300) * sp, 0.3 + R() * 0.3, 2 + R() * 3, i % 3 ? STREAK : SQUARE, i & 1 ? c : W, 3);
        this.add(x, y, 0, 0, 0.35, 50, RING, c, 0);
        break;
      }
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const l = this.life[i] - dt;
      if (l <= 0) {
        const j = --this.n;
        if (i !== j) {
          this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size[i] = this.size[j];
          this.drag[i] = this.drag[j]; this.shape[i] = this.shape[j]; this.col[i] = this.col[j];
        }
        continue;
      }
      this.life[i] = l;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] *= k;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  /** Additive draw. Caller must be in world space. Restores composite/alpha. */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.n === 0) return;
    ctx.globalCompositeOperation = 'lighter';
    let last = -1;
    for (let i = 0; i < this.n; i++) {
      const f = this.life[i] / this.maxLife[i];
      const c = this.col[i];
      const s = this.shape[i];
      if (c !== last) { const col = this.colors[c]; ctx.fillStyle = col; ctx.strokeStyle = col; last = c; }
      ctx.globalAlpha = f > 1 ? 1 : f;
      if (s === SQUARE) {
        const sz = this.size[i] * (0.4 + 0.6 * f);
        ctx.fillRect(this.x[i] - sz / 2, this.y[i] - sz / 2, sz, sz);
      } else if (s === STREAK) {
        ctx.lineWidth = this.size[i] * 0.6 * f + 0.5;
        ctx.beginPath(); ctx.moveTo(this.x[i], this.y[i]);
        ctx.lineTo(this.x[i] - this.vx[i] * 0.045, this.y[i] - this.vy[i] * 0.045); ctx.stroke();
      } else {
        const e = 1 - f;
        ctx.lineWidth = 3 * f + 0.5;
        ctx.beginPath(); ctx.arc(this.x[i], this.y[i], this.size[i] * (0.2 + 0.8 * (1 - (1 - e) * (1 - e))), 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
