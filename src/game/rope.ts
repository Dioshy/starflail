/** Verlet rope used purely for visuals (never affects the sim or the hash). */
export class Rope {
  readonly n = 8;
  readonly x = new Float64Array(8);
  readonly y = new Float64Array(8);
  private ox = new Float64Array(8);
  private oy = new Float64Array(8);
  private init = false;

  update(ax: number, ay: number, bx: number, by: number, slack: number, dt: number): void {
    const n = this.n;
    if (!this.init) {
      for (let i = 0; i < n; i++) { const t = i / (n - 1); this.x[i] = this.ox[i] = ax + (bx - ax) * t; this.y[i] = this.oy[i] = ay + (by - ay) * t; }
      this.init = true;
    }
    const seg = slack / (n - 1);
    const damp = Math.pow(0.02, dt);
    for (let i = 1; i < n - 1; i++) {
      const vx = (this.x[i] - this.ox[i]) * damp, vy = (this.y[i] - this.oy[i]) * damp;
      this.ox[i] = this.x[i]; this.oy[i] = this.y[i];
      this.x[i] += vx; this.y[i] += vy;
    }
    for (let it = 0; it < 6; it++) {
      this.x[0] = ax; this.y[0] = ay; this.x[n - 1] = bx; this.y[n - 1] = by;
      for (let i = 0; i < n - 1; i++) {
        const dx = this.x[i + 1] - this.x[i], dy = this.y[i + 1] - this.y[i];
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - seg) / d;
        // only resist stretch loosely; allow slack to bunch
        const k = d > seg ? 0.5 : 0.15;
        const wa = i === 0 ? 0 : k, wb = i + 1 === n - 1 ? 0 : k;
        this.x[i] += dx * diff * wa; this.y[i] += dy * diff * wa;
        this.x[i + 1] -= dx * diff * wb; this.y[i + 1] -= dy * diff * wb;
      }
    }
    this.x[0] = ax; this.y[0] = ay; this.x[n - 1] = bx; this.y[n - 1] = by;
  }

  reset(): void { this.init = false; }
}
