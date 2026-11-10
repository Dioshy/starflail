import { PALETTE, ENEMY_FILL, type EnemyState } from './palette';
import { drawGlow } from './glow';
import { pulse01, HIT_FLASH_MAX_ALPHA } from './telegraph';

const TAU = Math.PI * 2;

function colorOf(id: string): string {
  return (PALETTE.enemy as Record<string, string>)[id] ?? (PALETTE.boss as Record<string, string>)[id] ?? '#ffffff';
}

/** fill dark body, neon outline, white hit flash. Path must already be built. */
function paint(ctx: CanvasRenderingContext2D, id: string, col: string, lw: number, flash: number): void {
  ctx.fillStyle = ENEMY_FILL[id] ?? '#222';
  ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  ctx.stroke();
  if (flash > 0) { ctx.globalAlpha = Math.min(1, flash) * HIT_FLASH_MAX_ALPHA; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1; }
}

function poly(ctx: CanvasRenderingContext2D, n: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

export function drawEnemy(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number, angle: number, t: number, hit: number, state: EnemyState): void {
  const col = colorOf(id);
  const tele = state === 'telegraph', atk = state === 'attack';
  const boss = id === 'warden' || id === 'hive' || id === 'eclipse';
  ctx.save();
  ctx.translate(x, y);
  const pu = pulse01(t, x * 0.01);
  drawGlow(ctx, 0, 0, r * (boss ? 2.2 : 2.4), col, tele ? 0.38 + 0.22 * pu : atk ? 0.5 : 0.3);
  if (tele && !boss) {
    // steady non-flashing cue: a breathing warning ring (the world-space charge ring comes from drawTelegraph)
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.55 + 0.3 * pu;
    ctx.beginPath(); ctx.arc(0, 0, r * (1.55 + 0.12 * pu), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.rotate(angle);
  switch (id) {
    case 'mite': {
      // small, SOLID, round-edged triangle (filled bright body)
      ctx.rotate(Math.sin(t * 15 + x * 0.1) * 0.15);
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.8, r * 0.8); ctx.lineTo(-r * 0.8, -r * 0.8); ctx.closePath();
      ctx.fillStyle = '#b3162d'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
      if (hit > 0) { ctx.globalAlpha = Math.min(1, hit) * HIT_FLASH_MAX_ALPHA; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1; }
      break;
    }
    case 'dart': {
      // long, thin, HOLLOW arrowhead (~1.6:1) with a tail streak behind it. Always streaks; longer while attacking.
      const sc = tele ? 1 + 0.07 * pu : 1;
      ctx.scale(sc, sc);
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      ctx.globalAlpha = atk ? 0.7 : 0.45; ctx.lineWidth = 2;
      const tl = atk ? 3.4 : 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * tl, 0);
      if (atk) { ctx.moveTo(-r * 0.7, r * 0.45); ctx.lineTo(-r * 2.6, r * 0.45); ctx.moveTo(-r * 0.7, -r * 0.45); ctx.lineTo(-r * 2.6, -r * 0.45); }
      ctx.stroke(); ctx.globalAlpha = 1;
      const l = atk ? 1.25 : 1.15;
      ctx.beginPath(); ctx.moveTo(r * l, 0); ctx.lineTo(-r * 0.8, r * 0.6); ctx.lineTo(-r * 0.35, 0); ctx.lineTo(-r * 0.8, -r * 0.6); ctx.closePath();
      ctx.fillStyle = '#0b0803'; ctx.fill();
      ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();
      if (hit > 0) { ctx.globalAlpha = Math.min(1, hit) * HIT_FLASH_MAX_ALPHA; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1; }
      break;
    }
    case 'wisp': {
      const fl = hit > 0 ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + x);
      const rr = r * (tele ? 1 + 0.12 * pu : 1);
      ctx.rotate(t * 2);
      ctx.globalAlpha = Math.max(0.6, fl);
      ctx.strokeStyle = hit > 0 ? '#ffffff' : atk ? '#ffffff' : col; ctx.lineWidth = atk ? 4 : 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, rr, 0.3, 2.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr, 3.4, 5.4); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'blob':
    case 'blobling': {
      const big = id === 'blob';
      const amp = (big ? 0.12 : 0.18) * (atk ? 1.8 : 1), sp = tele ? 10 : 5;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * TAU, rr = r * (1 + amp * Math.sin(t * sp + i * 1.7));
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      paint(ctx, id, col, 2.4, hit);
      if (big) { ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(Math.sin(t * 2) * r * 0.2, Math.cos(t * 2.3) * r * 0.2, r * 0.28, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      break;
    }
    case 'spitter': {
      poly(ctx, 6, r, 0);
      paint(ctx, id, col, 2.4, hit);
      const open = atk ? 0.75 : tele ? 0.2 + 0.4 * pu : 0.15;
      ctx.fillStyle = atk ? '#ffffff' : tele ? '#ffb3dc' : '#12020c';
      if (tele) { ctx.globalAlpha = 0.65 + 0.3 * pu; } else if (atk) { ctx.globalAlpha = 0.9; }
      ctx.beginPath(); ctx.moveTo(r * 0.15, 0); ctx.lineTo(r * 0.95, -r * open); ctx.lineTo(r * 0.95, r * open); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'brute': {
      const sh = atk ? Math.sin(t * 60) * 1.5 : 0;
      ctx.translate(sh, 0);
      ctx.beginPath(); ctx.rect(-r, -r, r * 2, r * 2);
      paint(ctx, id, col, 3.5, hit);
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
      ctx.fillStyle = col;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) ctx.fillRect(sx * r * 0.78 - 1.5, sy * r * 0.78 - 1.5, 3, 3);
      if (tele || atk) {
        ctx.fillStyle = '#ffd0a0'; ctx.globalAlpha = tele ? 0.6 + 0.4 * pu : 1;
        ctx.fillRect(r * 0.2, -r * 0.35, r * 0.7, 3); ctx.fillRect(r * 0.2, r * 0.35 - 3, r * 0.7, 3); ctx.globalAlpha = 1;
      }
      break;
    }
    case 'warden': {
      const spin = atk ? 4 : tele ? 0.3 : 0.8;
      const dist = r * (tele ? 1.35 + 0.08 * pu : 1.15);
      poly(ctx, 8, r, Math.PI / 8);
      paint(ctx, id, col, 4, hit);
      ctx.lineWidth = 2; ctx.strokeStyle = col; poly(ctx, 8, r * 0.62, Math.PI / 8); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = t * spin + (i * TAU) / 4;
        ctx.save(); ctx.rotate(a); ctx.translate(dist, 0);
        ctx.beginPath(); ctx.rect(-r * 0.12, -r * 0.4, r * 0.24, r * 0.8);
        ctx.fillStyle = tele || atk ? '#ffd9a8' : '#4a2209'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = tele || atk ? '#ffffff' : col;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#12060a'; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.11, 0, TAU); ctx.fill();
      break;
    }
    case 'hive': {
      const pulse = 1 + 0.06 * (tele ? pu * 2 - 1 : Math.sin(t * 3));
      poly(ctx, 6, r * 0.75 * pulse, 0);
      paint(ctx, id, col, 4, hit);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t * 0.4;
        const pr = r * (atk ? 0.3 : 0.24) * (tele ? 1 + 0.3 * pu : 1);
        const px = Math.cos(a) * r * 0.95, py = Math.sin(a) * r * 0.95;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU);
        ctx.fillStyle = atk || tele ? col : ENEMY_FILL.hive; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.globalAlpha = 0.7;
      poly(ctx, 6, r * 0.4, Math.PI / 6); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, TAU); ctx.fill();
      break;
    }
    case 'eclipse': {
      const ex = tele ? 1.12 + 0.06 * pu : atk ? 1.25 : 1.0;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU);
      paint(ctx, id, col, 4, hit);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = t * (0.7 + i * 0.3) * (i % 2 ? -1 : 1) + i * 2;
        ctx.strokeStyle = i === 0 ? '#ffffff' : col; ctx.lineWidth = 5 - i; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, r * ex * (0.95 + i * 0.07), a, a + 1.6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (atk) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + t; ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45); } ctx.stroke(); }
      // crescent bite: bright sliver on the leading edge
      ctx.fillStyle = tele || atk ? '#ffffff' : col; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -0.9, 0.9); ctx.arc(-r * 0.2, 0, r * 0.74, 0.9, -0.9, true); ctx.fill();
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); paint(ctx, id, col, 2, hit);
    }
  }
  ctx.restore();
}
