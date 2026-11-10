import { JOY_RADIUS, REEL_BTN, type TouchState } from '../core/input';
import { LOGICAL_H, LOGICAL_W } from '../core/canvas';
import type { World } from '../game/sim';

const FONT = '600 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
  c.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  c.textAlign = align; c.fillStyle = color; c.fillText(s, x, y);
}

export function drawHud(c: CanvasRenderingContext2D, w: World, time: number): void {
  c.save();
  c.globalCompositeOperation = 'source-over';
  c.shadowBlur = 0;
  // hearts
  const max = w.T.hearts;
  for (let i = 0; i < max; i++) {
    const x = 34 + i * 34, y = 36, full = i < w.ship.hearts;
    c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2);
    c.fillStyle = full ? '#ff3d6e' : 'rgba(255,61,110,0.15)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = full ? '#ffd0dc' : 'rgba(255,255,255,0.2)'; c.stroke();
  }
  // timer + kills
  const sec = Math.floor(w.time), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
  text(c, `${mm}:${ss}`, LOGICAL_W / 2, 40, 26, '#e8f6ff', 'center');
  text(c, `${w.kills} smashed`, LOGICAL_W - 24, 38, 18, '#9fb6d9', 'right');
  // xp bar
  const bw = 520, bx = (LOGICAL_W - bw) / 2, by = LOGICAL_H - 34;
  c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(bx, by, bw, 10);
  c.fillStyle = '#35f2c4'; c.fillRect(bx, by, bw * Math.min(1, w.xp / w.xpNext), 10);
  text(c, `LV ${w.level}`, bx - 14, by + 10, 18, '#35f2c4', 'right');
  // orb speed meter: shows where damage starts
  const T = w.T, mx = 24, my = LOGICAL_H - 34, mw = 180;
  c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(mx, my, mw, 10);
  const sp = w.orbSpeed(), f = Math.min(1, sp / T.maxOrbSpeed);
  c.fillStyle = sp >= T.critSpeed ? '#ffb347' : sp >= T.minDamageSpeed ? '#7ee8ff' : '#4a5a85';
  c.fillRect(mx, my, mw * f, 10);
  c.fillStyle = '#fff';
  c.fillRect(mx + (mw * T.minDamageSpeed) / T.maxOrbSpeed - 1, my - 3, 2, 16);
  c.fillRect(mx + (mw * T.critSpeed) / T.maxOrbSpeed - 1, my - 3, 2, 16);
  text(c, 'SPEED', mx, my - 8, 12, '#9fb6d9');
  void FONT; void time;
  c.restore();
}

export function drawTouch(c: CanvasRenderingContext2D, t: TouchState): void {
  if (!t.seen) return;
  c.save();
  c.globalCompositeOperation = 'source-over';
  c.lineWidth = 3;
  if (t.joyActive) {
    c.strokeStyle = 'rgba(126,232,255,0.5)';
    c.beginPath(); c.arc(t.joyOx, t.joyOy, JOY_RADIUS, 0, Math.PI * 2); c.stroke();
    const dx = t.joyX - t.joyOx, dy = t.joyY - t.joyOy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / JOY_RADIUS);
    c.fillStyle = 'rgba(126,232,255,0.45)';
    c.beginPath(); c.arc(t.joyOx + (dx / d) * k * JOY_RADIUS, t.joyOy + (dy / d) * k * JOY_RADIUS, 28, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = t.reelActive ? 'rgba(255,179,71,0.9)' : 'rgba(255,179,71,0.4)';
  c.fillStyle = t.reelActive ? 'rgba(255,179,71,0.3)' : 'rgba(255,179,71,0.08)';
  c.beginPath(); c.arc(REEL_BTN.x, REEL_BTN.y, REEL_BTN.r, 0, Math.PI * 2); c.fill(); c.stroke();
  text(c, 'REEL', REEL_BTN.x, REEL_BTN.y + 8, 24, 'rgba(255,220,170,0.9)', 'center');
  c.restore();
}

export function drawDeath(c: CanvasRenderingContext2D, w: World, touch: boolean): void {
  c.save();
  c.globalCompositeOperation = 'source-over';
  const a = Math.min(0.6, w.deadTime * 1.5);
  c.fillStyle = `rgba(5,6,15,${a})`; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  if (w.deadTime > 0.15) {
    text(c, 'TETHER SEVERED', LOGICAL_W / 2, 300, 54, '#ff3d6e', 'center');
    const sec = Math.floor(w.time);
    text(c, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}  ·  ${w.kills} smashed  ·  LV ${w.level}`, LOGICAL_W / 2, 350, 22, '#e8f6ff', 'center');
    if (w.deadTime >= w.T.deathLockout) text(c, touch ? 'TAP TO GO AGAIN' : 'PRESS ENTER / SPACE / CLICK TO GO AGAIN', LOGICAL_W / 2, 410, 22, '#35f2c4', 'center');
  }
  c.restore();
}

export function drawPause(c: CanvasRenderingContext2D): void {
  c.save();
  c.fillStyle = 'rgba(5,6,15,0.65)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  text(c, 'PAUSED', LOGICAL_W / 2, 340, 54, '#e8f6ff', 'center');
  text(c, 'Esc / P / Start to resume', LOGICAL_W / 2, 385, 20, '#9fb6d9', 'center');
  c.restore();
}

export function drawDebug(c: CanvasRenderingContext2D, lines: string[]): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(8, 56, 300, lines.length * 18 + 10);
  c.font = '14px ui-monospace, Menlo, Consolas, monospace'; c.textAlign = 'left'; c.fillStyle = '#9dff9d';
  lines.forEach((l, i) => c.fillText(l, 16, 76 + i * 18));
  c.restore();
}
