import { JOY_RADIUS, type TouchState } from '../core/input';

/** Floating virtual joystick (canvas). The REEL / pause buttons are DOM (hud.ts). */
export function drawJoystick(c: CanvasRenderingContext2D, t: TouchState): void {
  if (!t.seen || !t.joyActive) return;
  c.save();
  c.globalCompositeOperation = 'source-over';
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(126,232,255,0.5)';
  c.beginPath(); c.arc(t.joyOx, t.joyOy, JOY_RADIUS, 0, Math.PI * 2); c.stroke();
  const dx = t.joyX - t.joyOx, dy = t.joyY - t.joyOy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / JOY_RADIUS);
  c.fillStyle = 'rgba(126,232,255,0.45)';
  c.beginPath(); c.arc(t.joyOx + (dx / d) * k * JOY_RADIUS, t.joyOy + (dy / d) * k * JOY_RADIUS, 28, 0, Math.PI * 2); c.fill();
  c.restore();
}

export function drawDebug(c: CanvasRenderingContext2D, lines: string[]): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(8, 64, 330, lines.length * 18 + 10);
  c.font = '14px ui-monospace, Menlo, Consolas, monospace'; c.textAlign = 'left'; c.fillStyle = '#9dff9d';
  lines.forEach((l, i) => c.fillText(l, 16, 84 + i * 18));
  c.restore();
}
