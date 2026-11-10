import { expect, it } from 'vitest';
import { World } from '../src/game/sim';

/** Total orb damage dealt over a scripted 60 s run (3 seeds), ship circling at `rate`, reel driven by reelFn. */
function damage(reelFn: (t: number) => boolean, rate: number): number {
  let total = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World({ seed, god: true, stress: 80 });
    for (let t = 0; t < 3600; t++) {
      const a = t * 0.07 * rate;
      w.step({ moveX: Math.cos(a), moveY: Math.sin(a), reel: reelFn(t), pause: false, confirm: false });
      for (const e of w.events) if (e.type === 'hit') total += e.dmg;
      w.events.length = 0;
    }
  }
  return total / 180;
}

it('well-timed reel pulses out-damage holding reel permanently (short tether reaches fewer enemies)', () => {
  for (const rate of [0.5, 1, 2]) {
    const hold = damage(() => true, rate);
    const pulse = damage((t) => t % 90 < 28, rate);
    expect(pulse, `rate ${rate}: pulse ${pulse.toFixed(1)} vs hold ${hold.toFixed(1)}`).toBeGreaterThan(hold);
  }
});
