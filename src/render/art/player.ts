import { PALETTE, type ShipSkin, type OrbSkin, type TrailId } from './palette';
import { drawGlow } from './glow';

interface ShipStyle { fill: string; edge: string; accent: string }
const SHIP: Record<ShipSkin, ShipStyle> = {
  default: { fill: '#0d2a4a', edge: '#35e6ff', accent: '#ffffff' },
  neon: { fill: '#0a1f5c', edge: '#4d7cff', accent: '#9fffe8' },
  ember: { fill: '#3a1608', edge: '#ffb36b', accent: '#ff6a2b' },
  void: { fill: '#120826', edge: '#9b6bff', accent: '#e0d0ff' },
  gold: { fill: '#3a2a05', edge: '#ffd166', accent: '#fff2b8' },
};

interface OrbStyle { mid: string; glow: string; edge: string }
const ORB: Record<OrbSkin, OrbStyle> = {
  default: { mid: '#8ff5ff', glow: '#35e6ff', edge: '#35e6ff' },
  plasma: { mid: '#a9b8ff', glow: '#5a7bff', edge: '#7d96ff' },
  ice: { mid: '#e6fbff', glow: '#9fe8ff', edge: '#d6f6ff' },
  molten: { mid: '#ffd08a', glow: '#ffb347', edge: '#ff8a2b' },
  prism: { mid: '#ffffff', glow: '#c8d8ff', edge: '#ffffff' },
};
const RAINBOW: string[] = [];
for (let i = 0; i < 36; i++) RAINBOW.push(`hsl(${i * 10} 100% 62%)`);

export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, r: number, skin: ShipSkin, t: number, hurt: number): void {
  const s = SHIP[skin];
  drawGlow(ctx, x, y, r * 2.6, s.edge, 0.35);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // engine flame
  const fl = r * (0.7 + 0.35 * Math.sin(t * 40));
  ctx.fillStyle = s.accent;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.22); ctx.lineTo(-r * 0.55 - fl, 0); ctx.lineTo(-r * 0.55, -r * 0.22);
  ctx.fill();
  ctx.globalAlpha = 1;
  // hull
  ctx.beginPath();
  ctx.moveTo(r * 1.25, 0); ctx.lineTo(-r * 0.8, r * 0.9); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, -r * 0.9);
  ctx.closePath();
  ctx.fillStyle = s.fill; ctx.fill();
  ctx.lineWidth = 2.2; ctx.strokeStyle = s.edge; ctx.lineJoin = 'round'; ctx.stroke();
  if (skin === 'neon') {
    ctx.lineWidth = 1; ctx.strokeStyle = s.accent; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(r * 0.6, 0); ctx.lineTo(-r * 0.5, r * 0.5); ctx.moveTo(r * 0.6, 0); ctx.lineTo(-r * 0.5, -r * 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (skin === 'ember') {
    ctx.fillStyle = s.accent; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 12);
    ctx.beginPath(); ctx.moveTo(r * 0.2, 0); ctx.lineTo(-r * 0.5, r * 0.45); ctx.lineTo(-r * 0.5, -r * 0.45); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (skin === 'void') {
    ctx.fillStyle = s.accent;
    for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.3 + i * r * 0.3, (i - 1) * r * 0.25, 1.5, 1.5);
  } else if (skin === 'gold') {
    const sh = ((t * 0.8) % 1.6) - 0.3; // shimmer sweep
    ctx.globalAlpha = 0.7; ctx.strokeStyle = s.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r * (1.2 - sh * 2), -r * 0.6); ctx.lineTo(r * (0.8 - sh * 2), r * 0.6); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // readability marks: white cockpit + cyan nose dot on EVERY skin
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-r * 0.05, 0, r * 0.2, 0, 6.2832); ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.14, 0, 6.2832); ctx.fill();
  if (hurt > 0) {
    ctx.globalAlpha = Math.min(1, hurt) * 0.85; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(r * 1.25, 0); ctx.lineTo(-r * 0.8, r * 0.9); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, -r * 0.9); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, speed01: number, skin: OrbSkin, t: number): void {
  const s = ORB[skin];
  const sp = Math.max(0, Math.min(1, speed01));
  drawGlow(ctx, x, y, r * (3.2 + sp * 2.2), s.glow, 0.55 + 0.45 * sp);
  drawGlow(ctx, x, y, r * 1.8, '#ffffff', 0.5 + 0.3 * sp);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * (2 + sp * 16));
  const n = skin === 'ice' ? 6 : 8;
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * 6.2832;
    const rr = i % 2 === 0 ? r * 1.3 : r * 0.82;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = s.mid; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
  ctx.lineWidth = 2; ctx.strokeStyle = s.edge; ctx.lineJoin = 'round'; ctx.stroke();
  if (skin === 'prism') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832;
      ctx.strokeStyle = RAINBOW[(((i * 4 + (t * 20) | 0)) % 36 + 36) % 36];
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25); ctx.stroke();
    }
  } else if (skin === 'molten') {
    ctx.strokeStyle = '#ff4a1a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(0, r * 0.1); ctx.lineTo(r * 0.5, -r * 0.4); ctx.moveTo(0, r * 0.1); ctx.lineTo(r * 0.2, r * 0.7); ctx.stroke();
  } else if (skin === 'plasma') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0.3, 2.4); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
  // white-hot core: the orb is always the brightest thing on screen
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 6.2832); ctx.fill();
  if (sp > 0.7) {
    ctx.globalAlpha = (sp - 0.7) * 2.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * (1.6 + 0.2 * Math.sin(t * 30)), 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

const DASH_A = [10, 6];
const NO_DASH: number[] = [];
export function drawTether(ctx: CanvasRenderingContext2D, pts: Float32Array, tension01: number, reeling: boolean, skin: OrbSkin, t?: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const s = ORB[skin];
  const k = Math.max(0, Math.min(1, tension01));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  };
  path();
  ctx.globalAlpha = 0.28 + 0.2 * k; ctx.strokeStyle = s.glow; ctx.lineWidth = 7 - 3 * k; ctx.stroke();
  ctx.globalAlpha = 1;
  path();
  ctx.strokeStyle = k > 0.8 ? '#ffffff' : s.mid; ctx.lineWidth = 2.5 - 1 * k; ctx.stroke();
  if (reeling) {
    ctx.setLineDash(DASH_A); ctx.lineDashOffset = -((t !== undefined ? t * 1000 : performance.now()) * 0.06) % 16;
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0;
  }
}

/** pts: x,y pairs ordered oldest -> newest (alpha/width grow toward the end). */
export function drawTrail(ctx: CanvasRenderingContext2D, pts: Float32Array, trail: TrailId, t: number): void {
  if (trail === 'none') return;
  const n = pts.length >> 1;
  if (n < 2) return;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    const f = i / (n - 1);
    const x0 = pts[i * 2 - 2], y0 = pts[i * 2 - 1], x1 = pts[i * 2], y1 = pts[i * 2 + 1];
    if (trail === 'ribbon') {
      ctx.globalAlpha = f * 0.6; ctx.strokeStyle = PALETTE.player; ctx.lineWidth = 1 + f * 5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else if (trail === 'rainbow') {
      ctx.globalAlpha = f * 0.75; ctx.strokeStyle = RAINBOW[((i * 3 + t * 60) | 0) % 36]; ctx.lineWidth = 1 + f * 4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else if (trail === 'spark') {
      if (i % 2) continue;
      ctx.globalAlpha = f; ctx.fillStyle = i % 4 ? '#ffffff' : PALETTE.player;
      const j = Math.sin(t * 20 + i) * 2;
      ctx.fillRect(x1 + j - 1, y1 - j - 1, 1 + f * 2.5, 1 + f * 2.5);
    } else {
      ctx.globalAlpha = f * 0.8; ctx.fillStyle = PALETTE.player;
      ctx.fillRect(Math.round(x1 / 4) * 4, Math.round(y1 / 4) * 4, 4, 4);
    }
  }
  ctx.globalAlpha = 1;
}
