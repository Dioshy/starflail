export const LOGICAL_W = 1280;
export const LOGICAL_H = 720;

/** Letterboxed, DPR-aware 1280x720 logical canvas. */
export class Screen {
  readonly ctx: CanvasRenderingContext2D;
  scale = 1;
  offX = 0;
  offY = 0;
  dpr = 1;
  cssW = LOGICAL_W;
  cssH = LOGICAL_H;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.scale = Math.min(this.cssW / LOGICAL_W, this.cssH / LOGICAL_H);
    this.offX = (this.cssW - LOGICAL_W * this.scale) / 2;
    this.offY = (this.cssH - LOGICAL_H * this.scale) / 2;
  }

  /** Clears the bars, then sets up logical coordinates clipped to the 16:9 playfield. */
  begin(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.dpr * this.scale;
    c.setTransform(s, 0, 0, s, this.offX * this.dpr, this.offY * this.dpr);
    c.beginPath();
    c.rect(0, 0, LOGICAL_W, LOGICAL_H);
    c.clip();
  }

  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.offX) / this.scale,
      y: (clientY - r.top - this.offY) / this.scale,
    };
  }
}
