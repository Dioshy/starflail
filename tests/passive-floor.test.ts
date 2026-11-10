import { describe, expect, it } from 'vitest';
import { World } from '../src/game/sim';

type Any = Record<string, any>;
interface Res { dps: number; hits: number; medianSpeed: number; medianMiteDmg: number }

/**
 * Ship circles at `rate` (1 = the tight ~76 px circle of reel-skill.test.ts, the regime balance.md s8 models); reel driven by
 * reelFn. 6 seeds x 60 s in a crowd (god so the crowd stays). NOTE: on a wide circle (rate <= 0.7, ~150+ px, tether taut) an
 * unreeled orb already swings at 600+ px/s and out-damages fixed-phase pulses; that regime is not what the floor targets.
 */
function harness(reelFn: (t: number) => boolean, rate = 1): Res {
  let total = 0, secs = 0;
  const speeds: number[] = [], mite: number[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new World({ seed, god: true, stress: 80 });
    for (let t = 0; t < 3600; t++) {
      const a = t * 0.07 * rate;
      w.step({ moveX: Math.cos(a), moveY: Math.sin(a), reel: reelFn(t), pause: false, confirm: false });
      for (const e of w.events as Any[]) if (e.type === 'hit' && !e.secondary && !e.bump) { total += e.dmg; speeds.push(e.speed); if (e.kind === 'mite') mite.push(e.dmg); }
      w.events.length = 0;
    }
    secs += 60;
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  return { dps: total / secs, hits: speeds.length, medianSpeed: med(speeds), medianMiteDmg: med(mite) };
}

describe('passive swing floor (balance.md s8)', () => {
  const passive = harness(() => false), pulsed = harness((t) => t % 90 < 28), held = harness(() => true);
  const ratio = passive.dps / pulsed.dps;
  console.log(`PASSIVE FLOOR  passive ${passive.dps.toFixed(1)} dps (median contact ${passive.medianSpeed.toFixed(0)} px/s, ${passive.hits} dmg hits)  pulsed ${pulsed.dps.toFixed(1)} dps (median ${pulsed.medianSpeed.toFixed(0)})  held ${held.dps.toFixed(1)} dps  passive/pulsed ${(ratio * 100).toFixed(1)}%  pulsed/held ${(pulsed.dps / held.dps).toFixed(2)}x  mite hits at passive median dmg ${passive.medianMiteDmg} = ${Math.ceil(20 / Math.max(1, passive.medianMiteDmg))}`);
  it('(a) passive DPS is 15-25% of pulsed-reel DPS', () => { expect(ratio).toBeGreaterThanOrEqual(0.15); expect(ratio).toBeLessThanOrEqual(0.25); });
  it('(b) a first-minute mite dies in at most 2 passive hits', () => { expect(Math.ceil(20 / passive.medianMiteDmg)).toBeLessThanOrEqual(2); });
  it('(c) pulsed DPS is more than 2x held-reel DPS', () => { expect(pulsed.dps / held.dps).toBeGreaterThan(2); });
}, 120000);
