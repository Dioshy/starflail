# Rule card: XP and Levels

| Field | Spec |
|---|---|
| Purpose | Fast, constant rewards: a level-up every 20-40 s feeds the draft (run loop). Collecting motes pulls the player into the crowd (risk/reward). |
| Inputs | Enemy death; ship within `pickupRadius` of a mote; magnet pickup; magnetPulse behavior. |
| State | `xp` (float), `level` (int, starts 1), `pendingDrafts` (int). Stats: `xpGain` 1 (0.5..2), `pickupRadius` 90 (60..320). PROGRESSION: `xpForLevel` (30 entries), `xpOverflowStep` 15. PICKUPS: `xpSmall` value 1, `xpBig` value 5. |
| Resolution | **Drop**: on death an enemy drops `xpMotes(enemy.xp)` (as many `xpBig` as fit, the rest `xpSmall`), scattered in a 16 px radius. Bosses drop their XP the same way. **Attract**: a mote within `pickupRadius` of the ship accelerates toward it at 2 400 px/s² (max 900 px/s) and never stops homing once triggered. **Collect** on touching the ship: `xp += value * xpGain`. **Level**: `while xp >= xpToNext(level)`: `xp -= xpToNext(level)`, `level += 1`, `pendingDrafts += 1`. `xpToNext(n) = xpForLevel[n-1]`, and past the table `last + 15 * (n - 30)`. **Draft**: if `pendingDrafts > 0` at the end of a tick, pause and open the draft (upgrade-draft.md); after each pick `pendingDrafts -= 1`. |
| Outputs | Events `xpCollected`, `levelUp {level}`. Feedback: the XP bar fills; a chime pitched up per mote within 0.3 s (combo pitch, resets after 0.3 s); level-up flash and a 0.2 s slow-motion before the draft opens. |
| Mote cap | At most 400 motes on the map. When the 401st spawns, the oldest mote merges into it (values add). No XP is ever destroyed. |

## Table (XP to next level, from `src/data/progression.ts`)

| Level → next | 1→2 | 2→3 | 3→4 | 4→5 | 5→6 | 6→7 | 7→8 | 8→9 | 9→10 | 10→11 | ... | 30→31 | 31→32 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XP | 10 | 18 | 28 | 40 | 54 | 70 | 85 | 100 | 115 | 130 | +15 each | 430 | 445 |

Modelled level-up times (balance.md §4): 15, 36, 58, 80, 101, 130, 155, 180, 218, 239, 273, 302, 328, 352, 390, 416, 443,
471, 501, 528 s, giving 20 drafts before Eclipse.

## Edge cases

| Case | Rule |
|---|---|
| One collection crosses two levels | Two drafts, shown one after another (`pendingDrafts = 2`). |
| Level-up during a boss telegraph | The draft pauses everything; telegraph timers resume where they were. |
| Magnet pickup | Every mote on the map starts homing. |
| xpGain at 2 (cap) | XP per mote doubles; the level curve is unchanged. |
| Death with motes on the ground | They are lost (XP does not carry over between runs). |
| Level beyond 31 (overtime) | Overflow formula; no cap on level (each level costs more, so no runaway). |

## Tests (given / when / then)

1. Given level 1 and 9 XP, when a 1-XP mote is collected, then level 2, xp 0, pendingDrafts 1.
2. Given level 1, xp 0, when a boss drops 80 XP and all of it is collected, then levels 2-4 are reached (10+18+28 = 56), xp = 24, pendingDrafts 3.
3. Given `xpToNext(30)` = 430, then `xpToNext(31)` = 445. *(Automated.)*
4. Given brute death (8 xp), then 1 xpBig + 3 xpSmall. *(Automated.)*
5. Given 400 motes, when one more drops, then the count stays 400 and total XP on the map is unchanged.
6. Given the modelled median run, then every gap between level-ups before 540 s is 20-40 s. *(Automated.)*

## Dominant-strategy review

- **Hoarding XP** (leave motes and collect them later) gives no benefit: the curve is per level, not per time, and motes don't expire. It is neutral, not exploitable.
- **XP stacking** (Star Charts ×3 = +30%): about 3-4 extra drafts per run, paid for with 3 picks that add no power. A fair trade.
