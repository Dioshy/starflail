import type { Intents } from '../core/input';
import type { World } from './sim';

/**
 * Scripted "circling bot" used by ?auto=1, ?skipTo and the headless balance test: it steers the ship in a tight
 * circle (keeping away from the wall) and pulses reel so the orb swings. It never dodges: a floor for survival
 * numbers, not a skill ceiling.
 */
export function botIntents(w: World): Intents {
  const t = w.tick, s = w.ship;
  let a = t * 0.07;
  let mx = Math.cos(a), my = Math.sin(a);
  const d = Math.hypot(s.x, s.y);
  if (d > 1100) { // drift back toward the middle
    const k = Math.min(1, (d - 1100) / 300);
    mx = mx * (1 - k) - (s.x / d) * k; my = my * (1 - k) - (s.y / d) * k;
    a = Math.atan2(my, mx);
  }
  return { moveX: mx, moveY: my, reel: t % 90 < 28, pause: false, confirm: false };
}
