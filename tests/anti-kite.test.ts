import { describe, expect, it } from 'vitest';
import { DIRECTOR, PROGRESSION } from '../src/data';
import { runStardust } from '../src/data/formulas';
import { World } from '../src/game/sim';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const huggerStep = (w: World): void => {
  const s = w.ship, d = Math.hypot(s.x, s.y) || 1, r = (1450 - d) / 150;
  w.step({ moveX: -s.y / d + (s.x / d) * r, moveY: s.x / d + (s.y / d) * r, reel: w.tick % 90 < 28, pause: false, confirm: false });
  w.events.length = 0; if (w.draft) w.pickDraft(0);
};

describe('M2: wall-hugging / AFK exploit', () => {
  it('a bot circling the arena wall cannot survive 5 minutes on any of 10 seeds', () => {
    const times: number[] = [];
    for (const seed of SEEDS) {
      const w = new World({ seed });
      while (!w.outcome && w.time < 300) huggerStep(w);
      times.push(w.outcome ? w.endTime : w.time);
    }
    expect(Math.max(...times), `survival times ${times.map((t) => t.toFixed(0))}`).toBeLessThan(300);
  });

  it('edge heat builds beyond the edge zone, cools inside it, and pulls spawns closer', () => {
    const w = new World({ seed: 3, god: true });
    w.ship.x = DIRECTOR.edgeZoneRadius + 150; w.ship.y = 0;
    for (let i = 0; i < 60 * DIRECTOR.edgeHeatSec; i++) { w.ship.x = DIRECTOR.edgeZoneRadius + 150; w.ship.y = 0; w.step({ moveX: 0, moveY: 0, reel: false, pause: false, confirm: false }); w.events.length = 0; }
    expect(w.edgeHeat).toBeGreaterThan(0.95);
    for (let i = 0; i < 60 * DIRECTOR.edgeCoolSec + 5; i++) { w.ship.x = 0; w.ship.y = 0; w.step({ moveX: 0, moveY: 0, reel: false, pause: false, confirm: false }); w.events.length = 0; }
    expect(w.edgeHeat).toBe(0);
  });

  it('time-based stardust is capped at 10 minutes (an hour of AFK pays the same as 10 min)', () => {
    const base = { bossKills: 0, won: false, stardustPickups: 0, stardustGain: 1 };
    const ten = runStardust({ ...base, secondsSurvived: PROGRESSION.stardust.maxTimeSec });
    expect(ten).toBe(Math.floor((PROGRESSION.stardust.maxTimeSec / 60) * PROGRESSION.stardust.perMinuteSurvived));
    expect(runStardust({ ...base, secondsSurvived: 3600 })).toBe(ten);
    expect(runStardust({ ...base, secondsSurvived: 300 })).toBeLessThan(ten);
  });
});
