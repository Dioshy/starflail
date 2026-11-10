import type { Intents } from '../core/input';
import type { World } from './sim';

/**
 * Scripted "circling bot" used by ?auto=1, ?skipTo and the headless balance test: it spirals around the nearest enemy (so the
 * orb swings through it), keeps off the wall, and pulses reel.
 * It never dodges telegraphs: a floor for survival numbers, not a skill ceiling.
 */
export function botIntents(w: World): Intents {
  const t = w.tick, s = w.ship;
  const a = t * 0.07;
  let mx = Math.cos(a), my = Math.sin(a);
  // lean toward the nearest enemy
  let best = 1e18, bx = 0, by = 0;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = w.enemies.items[i];
    const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (d < best) { best = d; bx = e.x - s.x; by = e.y - s.y; }
  }
  const nd = Math.sqrt(best);
  if (nd < 1500) {
    // orbit the nearest enemy at ~150 px at constant speed so the swinging orb keeps sweeping through it
    const ux = bx / (nd || 1), uy = by / (nd || 1);
    const radial = Math.max(-1, Math.min(1, (nd - 150) / 150));
    mx = -uy + ux * radial * 0.9; my = ux + uy * radial * 0.9;
  }
  const d = Math.hypot(s.x, s.y);
  if (d > 1100) { // drift back toward the middle
    const k = Math.min(1, (d - 1100) / 300);
    mx = mx * (1 - k) - (s.x / d) * k; my = my * (1 - k) - (s.y / d) * k;
  }
  return { moveX: mx, moveY: my, reel: t % 90 < 28, pause: false, confirm: false };
}
