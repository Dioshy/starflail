/** Logical view: height 720 on landscape (width follows the aspect up to 1600), width 720 on portrait (height up to 1600). */
export const BASE = 720;

/** DPR-aware canvas with a logical coordinate system that adapts to the window aspect ratio. */
export class Screen {
  readonly ctx: CanvasRenderingContext2D;
  /** logical size (what drawing code uses) */
  w = 1280;
  h = 720;
  scale = 1;
  offX = 0;
  offY = 0;
  dpr = 1;
  cssW = 1280;
  cssH = 720;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = Math.max(1, window.innerWidth);
    this.cssH = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    const aspect = this.cssW / this.cssH;
    if (aspect >= 1) { this.h = BASE; this.w = Math.min(1600, BASE * aspect); }
    else { this.w = BASE; this.h = Math.min(1600, BASE / aspect); }
    this.scale = Math.min(this.cssW / this.w, this.cssH / this.h);
    this.offX = (this.cssW - this.w * this.scale) / 2;
    this.offY = (this.cssH - this.h * this.scale) / 2;
  }

  /** Clears the bars, then sets up logical coordinates clipped to the playfield. */
  begin(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.dpr * this.scale;
    c.setTransform(s, 0, 0, s, this.offX * this.dpr, this.offY * this.dpr);
    c.beginPath();
    c.rect(0, 0, this.w, this.h);
    c.clip();
  }

  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.offX) / this.scale, y: (clientY - r.top - this.offY) / this.scale };
  }
}
