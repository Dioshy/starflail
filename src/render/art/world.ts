import { PALETTE, hexToRgba, type PickupKind, type ProjectileKind, type FloatKind } from './palette';
import { drawGlow } from './glow';

const TAU = Math.PI * 2;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// deterministic stars, 3 parallax layers
const STARS: Float32Array[] = [];
function stars(): Float32Array[] {
  if (!STARS.length) {
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let l = 0; l < 3; l++) { const a = new Float32Array(90 * 3); for (let i = 0; i < a.length; i++) a[i] = rnd(); STARS.push(a); }
  }
  return STARS;
}
const PAR = [0.08, 0.2, 0.4];
let bgGrad: CanvasGradient | null = null, bgKey = '';

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number, camY: number, t: number, intensity: number): void {
  const key = w + 'x' + h;
  if (key !== bgKey) {
    bgKey = key;
    bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
    bgGrad.addColorStop(0, PALETTE.bg2); bgGrad.addColorStop(0.55, PALETTE.bg1); bgGrad.addColorStop(1, PALETTE.bg0);
  }
  ctx.fillStyle = bgGrad!; ctx.fillRect(0, 0, w, h);
  // grid
  const gs = 96, f = 0.6;
  const ox = -((camX * f) % gs), oy = -((camY * f) % gs);
  ctx.globalAlpha = 0.1 + 0.07 * intensity + 0.03 * Math.sin(t * 2.07 * 3);
  ctx.strokeStyle = PALETTE.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = ox; x < w; x += gs) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = oy; y < h; y += gs) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
  ctx.fillStyle = PALETTE.star;
  const L = stars();
  for (let l = 0; l < 3; l++) {
    const a = L[l], p = PAR[l];
    ctx.globalAlpha = 0.3 + l * 0.2;
    for (let i = 0; i < a.length; i += 3) {
      const sx = (((a[i] * w - camX * p) % w) + w) % w, sy = (((a[i + 1] * h - camY * p) % h) + h) % h;
      const sz = 1 + l * 0.6 * (0.5 + a[i + 2]) * (0.8 + 0.2 * Math.sin(t * 3 + a[i + 2] * 20));
      ctx.fillRect(sx, sy, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawArenaBounds(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number): void {
  const big = radius * 4;
  ctx.beginPath(); ctx.rect(cx - big, cy - big, big * 2, big * 2); ctx.arc(cx, cy, radius, 0, TAU, true);
  ctx.fillStyle = 'rgba(3,5,16,0.55)'; ctx.fill('evenodd');
  const p = 0.7 + 0.3 * Math.sin(t * 2);
  ctx.strokeStyle = PALETTE.player; ctx.globalAlpha = 0.18 * p; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6; ctx.beginPath();
  for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, l = i % 6 === 0 ? 16 : 7; ctx.moveTo(cx + Math.cos(a) * (radius - 4), cy + Math.sin(a) * (radius - 4)); ctx.lineTo(cx + Math.cos(a) * (radius - 4 - l), cy + Math.sin(a) * (radius - 4 - l)); }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function drawProjectile(ctx: CanvasRenderingContext2D, kind: ProjectileKind, x: number, y: number, r: number, t: number): void {
  const c = PALETTE.projectile[kind];
  drawGlow(ctx, x, y, r * 3, c, 0.6);
  ctx.save(); ctx.translate(x, y);
  if (kind === 'spit') {
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = r * (1 + 0.15 * Math.sin(t * 14 + i * 2)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = c; ctx.fill();
    ctx.fillStyle = '#ffd6ee'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.2, r * 0.35, 0, TAU); ctx.fill();
  } else {
    ctx.rotate(t * 5);
    ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(0, r * 0.8); ctx.lineTo(-r * 1.4, 0); ctx.lineTo(0, -r * 0.8); ctx.closePath();
    ctx.fillStyle = '#3a0f08'; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export function drawPickup(ctx: CanvasRenderingContext2D, kind: PickupKind, x: number, y0: number, t: number): void {
  const c = PALETTE.pickup[kind];
  const y = y0 + Math.sin(t * 4 + x * 0.05) * 2;
  drawGlow(ctx, x, y, kind === 'xpSmall' ? 12 : 20, c, 0.7);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = c; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
  if (kind === 'xpSmall' || kind === 'xpBig') {
    const s = kind === 'xpSmall' ? 5 : 9;
    ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (kind === 'xpBig') { ctx.strokeStyle = c; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(0, 0, s * 1.9 + Math.sin(t * 5) * 1.5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  } else if (kind === 'heart') {
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-14, -1, -8, -11, 0, -4); ctx.bezierCurveTo(8, -11, 14, -1, 0, 8); ctx.fill(); ctx.stroke();
  } else if (kind === 'magnet') {
    ctx.lineWidth = 5; ctx.strokeStyle = c; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-7, -7); ctx.moveTo(7, 0); ctx.lineTo(7, -7); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(-7, -11); ctx.moveTo(7, -7); ctx.lineTo(7, -11); ctx.stroke();
  } else {
    const k = 0.8 + 0.25 * Math.sin(t * 6 + x);
    ctx.rotate(t * 1.5); ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = (i % 2 ? 3 : 10) * k; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

const TEXT_COL: Record<FloatKind, string> = { dmg: '#ffffff', crit: '#ffd166', heal: '#4dffc4', info: '#35e6ff' };
export function drawFloatingText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number, kind: FloatKind): void {
  const crit = kind === 'crit';
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `800 ${crit ? 24 : kind === 'dmg' ? 15 : 17}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,8,22,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = TEXT_COL[kind]; ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, t: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 64px ${FONT}`;
  const wob = Math.sin(t * 2) * 0.5;
  ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = hexToRgba(PALETTE.player, 0.25);
  ctx.strokeText('STARFLAIL', 0, 0);
  ctx.lineWidth = 3; ctx.strokeStyle = PALETTE.player; ctx.strokeText('STARFLAIL', 0, 0);
  ctx.fillStyle = '#0a1230'; ctx.fillText('STARFLAIL', 0, 0);
  // tether + orb swinging under the title
  const a = t * 2.4, ox = Math.cos(a) * 150, oy = 56 + Math.sin(a) * 8 + wob;
  ctx.strokeStyle = PALETTE.player; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-150, 56); ctx.quadraticCurveTo(0, 70, ox, oy); ctx.stroke();
  drawGlow(ctx, ox, oy, 44, PALETTE.player, 0.8);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ox, oy, 9, 0, TAU); ctx.fill();
  ctx.restore();
}
