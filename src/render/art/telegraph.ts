import { PALETTE } from './palette';

const TAU = Math.PI * 2;

/** Telegraph pulse rate. Never above 3 Hz (WCAG 2.3.1 general flash limit); we stay at 2.5 Hz. */
export const TELEGRAPH_HZ = 2.5;
const W = TAU * TELEGRAPH_HZ;

/** Smooth 0..1 sine pulse at TELEGRAPH_HZ. */
export function pulse01(t: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin(W * t + phase);
}

export interface TelegraphArgs {
  kind: string; // enemy / boss id
  pat: number; // boss pattern index
  phase2: boolean;
  state: 0 | 1 | 2; // 0 idle, 1 telegraph, 2 attack (only 1 draws)
  x: number; y: number; radius: number;
  dirX: number; dirY: number;
  tx: number; ty: number; // eclipse blink target
  /** 0..1 progress through the telegraph window */
  prog: number;
  t: number;
  params: Record<string, number>;
}

const DANGER = PALETTE.danger;

/** Charge ring: outline of the full ring + a sweep arc that completes exactly when the attack fires. */
function chargeRing(c: CanvasRenderingContext2D, x: number, y: number, r: number, prog: number, lw: number, col: string): void {
  c.lineWidth = lw;
  c.strokeStyle = col; c.globalAlpha = 0.28;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.globalAlpha = 0.95;
  c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, prog)); c.stroke();
}

/**
 * Directional lane: constant outline (never blinks) that fills from the enemy toward the end as the
 * telegraph runs out, with chevrons at the tip. Brightness gently breathes (2.5 Hz sine, never below 70 %).
 */
function lane(c: CanvasRenderingContext2D, a: TelegraphArgs, len: number, width: number, col: string, pu: number): void {
  const { x, y, dirX, dirY, prog } = a;
  const nx = -dirY, ny = dirX, hw = width / 2;
  const ex = x + dirX * len, ey = y + dirY * len;
  // faint body
  c.globalAlpha = 0.07 + 0.05 * pu; c.fillStyle = col;
  c.beginPath(); c.moveTo(x + nx * hw, y + ny * hw); c.lineTo(ex + nx * hw, ey + ny * hw); c.lineTo(ex - nx * hw, ey - ny * hw); c.lineTo(x - nx * hw, y - ny * hw); c.closePath(); c.fill();
  // charge fill: grows with progress
  const fl = len * prog;
  c.globalAlpha = 0.22 + 0.12 * pu;
  c.beginPath(); c.moveTo(x + nx * hw, y + ny * hw); c.lineTo(x + dirX * fl + nx * hw, y + dirY * fl + ny * hw); c.lineTo(x + dirX * fl - nx * hw, y + dirY * fl - ny * hw); c.lineTo(x - nx * hw, y - ny * hw); c.closePath(); c.fill();
  // steady edges
  c.globalAlpha = 0.55 + 0.3 * pu; c.strokeStyle = col; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x + nx * hw, y + ny * hw); c.lineTo(ex + nx * hw, ey + ny * hw); c.moveTo(x - nx * hw, y - ny * hw); c.lineTo(ex - nx * hw, ey - ny * hw); c.stroke();
  // end cap + chevrons point along the travel direction
  const cs = Math.min(hw + 6, 26);
  for (let i = 0; i < 2; i++) {
    const bx = ex - dirX * (8 + i * 14), by = ey - dirY * (8 + i * 14);
    c.globalAlpha = (0.85 - i * 0.3) * (0.8 + 0.2 * pu);
    c.beginPath(); c.moveTo(bx - dirX * 10 + nx * cs, by - dirY * 10 + ny * cs); c.lineTo(bx + dirX * 4, by + dirY * 4); c.lineTo(bx - dirX * 10 - nx * cs, by - dirY * 10 - ny * cs); c.stroke();
  }
}

/**
 * Draws the world-space telegraph for one enemy. Replaces the old 4 Hz white/red toggle:
 * steady danger colour, smooth sine breathing, and non-flashing meaning carriers
 * (growing fill, charge ring, direction chevrons, destination marker).
 */
export function drawTelegraph(c: CanvasRenderingContext2D, a: TelegraphArgs): void {
  if (a.state === 0 || (a.state === 2 && !(a.kind === 'eclipse' && a.pat === 2))) return;
  const { x, y, kind, prog, t, params: P } = a;
  const pu = pulse01(t);
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = DANGER; c.fillStyle = DANGER;
  const ring = (r: number, lw = 3, col = DANGER): void => { chargeRing(c, x, y, r, prog, lw, col); };
  switch (kind) {
    case 'dart': lane(c, a, P.dashSpeed * P.dashSec, 8 + prog * 8, DANGER, pu); ring(a.radius * 1.9, 2.5); break;
    case 'wisp': lane(c, a, P.lungeSpeed * P.lungeSec, 8 + prog * 6, '#c58bff', pu); ring(a.radius * 1.9, 2.5, '#c58bff'); break;
    case 'brute': lane(c, a, P.chargeSpeed * P.chargeSec, a.radius * 2 * (0.5 + prog * 0.5), DANGER, pu); ring(a.radius * 1.5, 3.5); break;
    case 'spitter': {
      // short aim line with an arrow tip + charge ring (ring is the timer)
      const l = 50 + prog * 40;
      c.globalAlpha = 0.55 + 0.35 * pu; c.strokeStyle = '#ff3fa4'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(x + a.dirX * 20, y + a.dirY * 20); c.lineTo(x + a.dirX * l, y + a.dirY * l); c.stroke();
      const nx = -a.dirY, ny = a.dirX, tx = x + a.dirX * l, ty = y + a.dirY * l;
      c.beginPath(); c.moveTo(tx - a.dirX * 9 + nx * 6, ty - a.dirY * 9 + ny * 6); c.lineTo(tx, ty); c.lineTo(tx - a.dirX * 9 - nx * 6, ty - a.dirY * 9 - ny * 6); c.stroke();
      ring(a.radius * 1.7, 2.5, '#ff3fa4');
      break;
    }
    case 'warden':
      if (a.pat === 1) { lane(c, a, P.chargeSpeed * P.chargeSec, 56, DANGER, pu); ring(a.radius * 1.5, 4); }
      else if (a.pat === 0) {
        const n = a.phase2 ? P.phase2RingCount : P.ringCount;
        c.globalAlpha = 0.45 + 0.4 * pu; c.lineWidth = 3; c.beginPath();
        for (let i = 0; i < n; i++) { const an = (i / n) * TAU, r0 = a.radius + 8, r1 = a.radius + 30 + prog * 30; c.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); c.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); }
        c.stroke();
        ring(a.radius * 1.5, 4);
      }
      break;
    case 'hive':
      if (a.pat === 1) {
        const half = (P.volleySpreadDeg * Math.PI) / 360, a0 = Math.atan2(a.dirY, a.dirX);
        c.globalAlpha = 0.08 + 0.06 * pu + prog * 0.2; c.beginPath(); c.moveTo(x, y); c.arc(x, y, 420, a0 - half, a0 + half); c.closePath(); c.fill();
        c.globalAlpha = 0.6 + 0.3 * pu; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + Math.cos(a0 - half) * 420, y + Math.sin(a0 - half) * 420); c.lineTo(x, y); c.lineTo(x + Math.cos(a0 + half) * 420, y + Math.sin(a0 + half) * 420); c.stroke();
        c.beginPath(); c.arc(x, y, 420, a0 - half, a0 + half); c.stroke();
      }
      ring(a.radius * 1.4, 4);
      break;
    case 'eclipse': {
      const pc = '#c07bff';
      if (a.pat === 0) {
        c.globalAlpha = 0.25 + 0.3 * pu + prog * 0.3; c.strokeStyle = pc; c.lineWidth = 3; c.beginPath();
        for (let i = 0; i < P.spiralArms; i++) { const an = Math.atan2(a.dirY, a.dirX) + (i / P.spiralArms) * TAU; c.moveTo(x, y); c.lineTo(x + Math.cos(an) * 520, y + Math.sin(an) * 520); }
        c.stroke();
        ring(a.radius * 1.5, 4, pc);
      } else if (a.pat === 1) {
        // BLINK: a destination marker you can read for the whole telegraph.
        const R = P.blinkRadius, X = a.tx, Y = a.ty;
        // path from boss to destination (dashed, constant)
        c.globalAlpha = 0.5; c.strokeStyle = pc; c.lineWidth = 2; c.setLineDash([10, 10]); c.lineDashOffset = -t * 30;
        c.beginPath(); c.moveTo(x, y); c.lineTo(X, Y); c.stroke(); c.setLineDash([]);
        // danger zone: dark violet disc that fills from the centre outward with progress
        c.fillStyle = '#1a0630'; c.globalAlpha = 0.35; c.beginPath(); c.arc(X, Y, R, 0, TAU); c.fill();
        c.fillStyle = DANGER; c.globalAlpha = 0.12 + 0.06 * pu; c.beginPath(); c.arc(X, Y, R * prog, 0, TAU); c.fill();
        // steady outer ring (full-time) + converging inner ring + sweep ring = three timers
        c.strokeStyle = pc; c.globalAlpha = 0.9; c.lineWidth = 3; c.beginPath(); c.arc(X, Y, R, 0, TAU); c.stroke();
        c.globalAlpha = 0.7; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, R * (1 - prog), 0, TAU); c.stroke();
        chargeRing(c, X, Y, R * 1.12, prog, 5, '#ffffff');
        // crosshair / X marker at the exact landing point
        c.strokeStyle = DANGER; c.lineWidth = 3; c.globalAlpha = 0.8 + 0.2 * pu;
        const k = 14;
        c.beginPath(); c.moveTo(X - k, Y - k); c.lineTo(X + k, Y + k); c.moveTo(X + k, Y - k); c.lineTo(X - k, Y + k); c.stroke();
        c.beginPath(); c.arc(X, Y, 5, 0, TAU); c.stroke();
        // charge ring around the boss as well
        ring(a.radius * 1.5, 4, pc);
      } else if (a.pat === 2) {
        c.globalAlpha = 0.2 + 0.2 * pu; c.strokeStyle = pc; c.lineWidth = 6; c.beginPath(); c.arc(x, y, P.wellRadius * (a.state === 1 ? 0.5 + 0.5 * prog : 1), 0, TAU); c.stroke();
        if (a.state === 1) ring(a.radius * 1.5, 4, pc);
      }
      break;
    }
    default:
  }
  c.restore();
}

/**
 * Eclipse well / persistent hazards are not a telegraph, but share the rule: slow breathing only.
 * Peak alpha for damage flashes: never above this, so a hit never reads as a full-screen-style strobe.
 */
export const HIT_FLASH_MAX_ALPHA = 0.45;
