import type { Intents } from '../src/core/input';
import { Rng } from '../src/core/rng';

export const idle = (): Intents => ({ moveX: 0, moveY: 0, reel: false, pause: false, confirm: false });

/** Deterministic scripted intents as a function of tick (no RNG state shared with the sim). */
export function scripted(t: number): Intents {
  const a = t * 0.05;
  return { moveX: Math.cos(a), moveY: Math.sin(a * 0.8), reel: Math.floor(t / 40) % 3 === 0, pause: false, confirm: t % 300 === 299 };
}

export function randomIntents(seed: number): () => Intents {
  const r = new Rng(seed);
  return () => ({ moveX: r.range(-1, 1), moveY: r.range(-1, 1), reel: r.chance(0.4), pause: false, confirm: false });
}
