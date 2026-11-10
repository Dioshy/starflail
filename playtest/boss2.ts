// Boss-aware probe: competent bot + drafts, but when a boss is up it orbits the boss (god mode so only damage output is measured).
import { World } from '../src/game/sim';
import { competentIntents, pickUpgradeIndex } from '../src/game/bot';
const R = Number(process.argv[2] ?? 110);
const GOD = process.argv[3] !== 'nogod';
function bossOrbit(w: World) {
  const b = w.activeBoss()!, s = w.ship;
  const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const radial = Math.max(-1, Math.min(1, (d - R) / 150));
  let mx = -uy + ux * radial, my = ux + uy * radial;
  const sd = Math.hypot(s.x, s.y);
  if (sd > 1300) { mx -= s.x / sd; my -= s.y / sd; }
  const len = Math.hypot(mx, my) || 1;
  return { moveX: mx / len, moveY: my / len, reel: w.tick % 90 < 28, pause: false, confirm: false };
}
for (const seed of [1, 2, 3, 4, 5]) {
  const w = new World({ seed, god: GOD });
  const kills: string[] = [];
    while (w.time < 700 && !w.outcome) {
    w.step(w.activeBoss() ? bossOrbit(w) : competentIntents(w)); for (const e of w.events) if (e.type === 'bossDie') kills.push(`${e.boss}@${w.time.toFixed(0)}`);
    w.events.length = 0; if (w.draft) w.pickDraft(pickUpgradeIndex(w));
  }
  console.log('seed', seed, 'lvl', w.level, 'bossKills', w.bossKills, kills.join(','), w.outcome ?? '');
}
