# Rule card: XP and Levels

| Field | Spec |
|---|---|
| Purpose | Fast, constant rewards: a level-up every 20-40 s feeds the draft (run loop). Collecting motes pulls the player into the crowd (risk/reward). |
| Inputs | Enemy death; ship within `pickupRadius` of a mote; magnet pickup; magnetPulse behavior. |
| State | `xp` (float), `level` (int, starts 1), `pendingDrafts` (int). Stats: `xpGain` 1 (0.5..2), `pickupRadius` 90 (60..320). PROGRESSION: `xpForLevel` (30 entries), `xpOverflowStep` 2. PICKUPS: `xpSmall` value 1, `xpBig` value 5. |
| Resolution | **Drop**: on death an enemy drops `xpMotes(enemy.xp)` (as many `xpBig` as fit, the rest `xpSmall`), scattered in a 16 px radius. Bosses drop their XP the same way. **Attract**: a mote within `pickupRadius` of the ship accelerates toward it at 2 400 px/s² (max 900 px/s) and never stops homing once triggered. **Collect** on touching the ship: `xp += value * xpGain`. **Level**: `while xp >= xpToNext(level)`: `xp -= xpToNext(level)`, `level += 1`, `pendingDrafts += 1`. `xpToNext(n) = xpForLevel[n-1]`, and past the table `last + 2 * (n - 30)`. **Draft**: if `pendingDrafts > 0` at the end of a tick, pause and open the draft (upgrade-draft.md); after each pick `pendingDrafts -= 1`. |
| Outputs | Events `xpCollected`, `levelUp {level}`. Feedback: the XP bar fills; a chime pitched up per mote within 0.3 s (combo pitch, resets after 0.3 s); level-up flash and a 0.2 s slow-motion before the draft opens. |
| Mote cap | At most 400 motes on the map. When the 401st spawns, the oldest mote merges into it (values add). No XP is ever destroyed. |

## Table (XP to next level, from `src/data/progression.ts`)

| Level → next | 1→2 | 2→3 | 3→4 | 4→5 | 5→6 | 6→7 | 7→8 | 8→9 | 9→10 | 10→11 | ... | 30→31 | 31→32 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XP | 5 | 9 | 12 | 14 | 16 | 17 | 18 | 19 | 20 | 21 | +1 each | 41 | 43 |

Cumulative: level 5 = 40 XP, level 10 = 130, level 15 = 245, level 20 = 385.
**Calculation:** a competent player collects about 0.83 XP/s at 1:00-2:00 and about 0.47 XP/s at 3:00-9:00 (measured, balance.md §4 M1).
That gives 0.83 × 20 s ≈ 17 XP and 0.47 × 40 s ≈ 19 XP, so the curve rises fast to about 16, then +1 per level.

Enemy XP: mite 1, blobling 1, dart 3, wisp 3, blob 5 (family 7), spitter 5, brute 14, Warden 45, Hive 90, Eclipse 0.

Measured (competent bot, seeds 1-10): **median level-up gap 22 s** (was 53 s), the median per-seed mean gap is 37 s, and the median
level at death is 15-16. Gaps are about 17 s in the first two minutes and 30-50 s after 3:00 (see balance.md §4 for the next levers).

## Edge cases

| Case | Rule |
|---|---|
| One collection crosses two levels | Two drafts, shown one after another (`pendingDrafts = 2`). |
| Level-up during a boss telegraph | The draft pauses everything; telegraph timers resume where they were. |
| Magnet pickup | Every mote on the map starts homing. |
| xpGain at 2 (cap) | XP per mote doubles; the level curve is unchanged. |
| Death with motes on the ground | They are lost (XP does not carry over between runs). |
| Level beyond 31 (overtime) | Overflow formula (+2 per level); no cap on level (each level costs more and overtime hpMul climbs, so no runaway). |

## Tests (given / when / then)

1. Given level 1 and 9 XP, when a 1-XP mote is collected, then level 2, xp 0, pendingDrafts 1.
2. Given level 1, xp 0, when the Warden drops 45 XP and all of it is collected, then levels 2-5 are reached (5+9+12+14 = 40), xp = 5, pendingDrafts 4.
3. Given `xpToNext(30)` = 41, then `xpToNext(31)` = 43. *(Automated.)*
4. Given brute death (14 xp), then 2 xpBig + 4 xpSmall. *(Automated for 8 xp: 1 xpBig + 3 xpSmall.)*
5. Given 400 motes, when one more drops, then the count stays 400 and total XP on the map is unchanged.
6. Given the measured-rate model (M1), then the first level-up is at ≤ 30 s, the median gap before 540 s is 20-40 s, and no gap exceeds 75 s. *(Automated.)*
7. Given a modelled player at the Warden (3:00) or Hive (6:00) spawn, when the boss's XP is collected, then 1-4 drafts follow. *(Automated.)*
8. Given the competent bot on seeds 1-10, then the median level-up gap is 20-40 s. *(Printed by tests/competent-bot.test.ts; checked by hand.)*

## Dominant-strategy review

- **Hoarding XP** (leave motes and collect them later) gives no benefit: the curve is per level, not per time, and motes don't expire. It is neutral, not exploitable.
- **XP stacking** (Star Charts ×3 = +30%): about 2-3 extra drafts per run at the new curve (0.51 XP/s × 600 s ≈ 306 XP, about level 17; ×1.3 ≈ 398 XP, about level 20), paid for with 3 picks that add no power. A fair trade.
