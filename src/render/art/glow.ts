import { hexToRgba } from './palette';

// Glow sprites are rendered once per (color, size bucket) and blitted additively.
// This replaces shadowBlur, which is far too slow per entity.
const cache = new Map<string, HTMLCanvasElement>();

function bucket(diameter: number): number {
  let b = 16;
  while (b < diameter && b < 256) b <<= 1;
  return b;
}

export function glowSprite(color: string, radius: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const b = bucket(radius * 2);
  const key = color + b;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = b;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(b / 2, b / 2, 0, b / 2, b / 2, b / 2);
    grad.addColorStop(0, hexToRgba(color, 1));
    grad.addColorStop(0.25, hexToRgba(color, 0.45));
    grad.addColorStop(0.6, hexToRgba(color, 0.12));
    grad.addColorStop(1, hexToRgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, b, b);
    cache.set(key, c);
  }
  return c;
}

/** Additive glow blit centered on (x,y). */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  const s = glowSprite(color, r);
  if (!s) return;
  const pa = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pa * alpha;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = pa;
  ctx.globalCompositeOperation = 'source-over';
}
