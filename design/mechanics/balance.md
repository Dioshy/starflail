# Balance: targets and the calculations behind them

All numbers here are **modelled**, not measured, except §4 (XP pacing), which since 2026-11-10 runs on rates measured from
the headless competent bot (M1), and §8 (P1-P3, Gear's harness). The executable model is `src/data/balanceModel.ts`, and the targets
are asserted in `src/data/data.test.ts`, so changing a data value that breaks a target fails CI. Replace assumptions
with telemetry after the first playtest (median time-of-death, boss kill times, level-up gaps, stardust per run).

## 0. Assumptions (each one labelled; every result below cites them)

| Id | Assumption | Value | Why / how to confirm |
|---|---|---|---|
| A1 | A median player kills about as fast as enemies spawn (steady state, below maxAlive) | kill rate = spawn rate | **Disproven by M1**: the competent bot kills ≈ 0.29/s, about 10-20% of spawnPerSec. No longer used for XP (§4). §1 (hearts) and §5 (stardust pickups) still use it and overestimate; see the open items in §4 |
| M1 | Competent player's kill rate and collected XP per kill, per minute | `MEASURED_PACING` in balanceModel.ts; run avg 0.29 kills/s × 1.73 XP/kill = 0.51 XP/s | Measured: bot, seeds 1-10, first run. Re-measure: `PACING_PROBE=1 npx vitest run src/data/pacingProbe.test.ts` |
| A2 | Share of dropped XP collected | 85% | pickupRadius 90 + homing; telemetry: XP collected / dropped |
| A3 | Median boss kill time on runs 3+ | Warden 41 s, Hive 55 s, Eclipse 54 s | §2 below |
| A4 | Share of stardust pickups collected | 80% | 30 s lifetime |
| A5 | Median player skill curve (death time and bosses per run) | see §5 table | Genre norms for 10-min runs; telemetry: run-index vs survival |
| A6 | Orb hits per second on a boss | run 1: 0.7, run 2: 0.85, run 3+: 1.0 (Warden), 1.2 (Hive), 1.3 (Eclipse) | Large hitboxes; each lap passes through once or twice |
| A7 | Share of boss hits that crit | run 1: 5%, run 2: 15%, run 3+: 30-50% | Rises as reel timing improves |
| A8 | Novice contact hits taken per minute (no upgrades in defence) | 0.3, 0.6, 1.2, 2.0, 2.0, 2.5 for minutes 1-6 | Estimate; telemetry: hits/min by minute |
| P1 | Gear's greybox (t11, `orbDrag` 1.25, circle rate 1): pulsed reels ≈ 790 dmg/s, held reel ≈ 290, never reeling ≈ 3 | measured | Gear's harness; re-run after every lever change in §8 |
| P2 | Same harness hit rate for passive and pulsed play (same circle rate and target ring) | h ≈ 790 / 160 ≈ 4.9 hits/s | Pulsed hits are mostly crits at ~1 000 px/s = 160 dmg |
| P3 | Passive (never-reel) orb speed at contact | p50 ≈ 220 px/s | Inferred: 3 dmg/s ÷ 4.9 hits/s = 0.6 dmg/hit, so only ~3% of passive hits clear 250 px/s. **Gear: log speed-at-contact to confirm** |

Note: A6 and A7 (§2) were written before Gear's relative `orbDrag`. Re-measure boss hit rate and crit share in the greybox
before trusting the §2 fight times.

## 1. First-run death at 4-7 minutes

Novice HP budget = 5 HP + hearts collected. Hearts drop at 0.5% per kill. Kills by 5:00 ≈ Σ spawnPerSec × duration =
24 + 36 + 96 + 120 + 90 + 144 = 510 (+ ~60 from events), so ≈ 2.8 hearts dropped, of which ~70% are collected → **≈ 2 HP**.
Effective budget ≈ **7 hits**.

Cumulative hits (A8): 0.3 → 0.9 → 2.1 → 4.1 → 6.1 → 8.6 at the end of minutes 1-6. The budget of 7 runs out during
minute 6, at about **5:20**. The model uses **4:50** for run 1 (`MEDIAN_PLAYER_RUNS[0].diesAtSec = 290`), allowing for
the Warden adding pressure at 3:00. **Target 4-7 min: met** (sensitivity: ±1 HP of budget moves death by ±25 s).

## 2. Boss fights sized for 30-60 s (median, run 3+)

`dmg = v × damagePerSpeed × mass^0.5 (× critMultiplier on crit)`; DPS = avg hit × hits/s (A6, A7).

| Boss | Picks by then | Build assumed | Non-crit hit | Crit hit | Avg hit | Hits/s | DPS | HP | Time |
|---|---|---|---|---|---|---|---|---|---|
| Warden 3:00 | 8 | Spiked Shell ×2 (0.0992/px/s) | 600 px/s → 60 | 950 → 188 | 0.7×60 + 0.3×188 = 98 | 1.0 | 98 | 4 000 | **41 s** |
| Hive 6:00 | 14 | Shell ×3, Heavy Core ×1, Hair Trigger ×1 (0.119 effective) | 620 → 74 | 950 → 226 | 0.6×74 + 0.4×226 = 135 | 1.2 × 0.85 (brood distraction) | 137 | 7 500 | **55 s** |
| Eclipse 9:00 | 20 | Shell ×4, Core ×2, Trigger ×2 (0.140 effective) | 650 → 91 | 1 000 → 280 | 0.5×91 + 0.5×280 = 186 | 1.3 | 241 | 13 000 | **54 s** |

Weaker players: run 1 at the Warden is 0.95×40 + 0.05×144 = 45 avg × 0.7 hits/s = **32 DPS → 126 s > 120 s leave timer**,
so the Warden usually escapes on run 1. Run 2 is 0.85×49 + 0.15×161 = 66 × 0.85 = **56 DPS → 71 s**: beatable.
**Target "first boss beaten by run 2-3": met** (and it is the reel, via the crit share, that makes the difference).

## 3. No uncapped multiplication

Every stat is clamped by `STAT_LIMITS`, and the stat formula adds multipliers before multiplying
(`(base + Σadd) × (1 + Σ(mul − 1))`), so stacking 5 × "+12%" gives +60%, not +76%.

Worst-case single hit (every damage stat at its cap): `1600 × 0.2 × √3 × 4` = **2 217**, which is below the Warden's 4 000 HP,
so no boss can be one-shot. *(Automated test.)*
Worst-case secondary damage per crit: chain 3 × 50% + explosion 60% = +210% of the crit, finite with no recursion
(behaviors.md). Worst-case orb count is 3 (Twin + Binary Star) at mass ≥ 0.4.
Positive loops and their caps: XP → power (STAT_LIMITS, hpMul ramp to 3.2); kills → more kills (maxAlive, hardEnemyCap 220).

## 4. A level-up every 20-40 seconds (measured, 2026-11-10)

**Why it changed.** The old model (A1 + A2) predicted 0.7-9.3 XP/s. Gear's competent bot collected 0.17-0.65 XP/s
(0.36 average), so the median level-up gap was **53 s** (44-137 s per seed). Two causes:
- The bot kills about 0.3 enemies/s, 10-20% of what spawns.
- It never kills Warden or Hive (they warp out after 120 s), so the boss XP lumps never arrive.

The model now uses M1: XP/s at t = `killsPerSec(minute) × xpPerKill(minute)`.

| Lever | Old → new | One-line calculation |
|---|---|---|
| `xpForLevel` | 10, 18, 28, 40, 54, 70, 85, 100, … 430 (+15/level) → **5, 9, 12, 14, 16, 17, 18, … 41 (+1/level)** | Early: 0.83 XP/s at 1:00-2:00 × 20 s ≈ 17 XP, so levels 2-6 cost 5-16. Mid: 0.47 XP/s at 3:00-9:00 × 40 s ≈ 19 XP, so levels 8-15 cost 19-26 |
| `xpOverflowStep` | 15 → **2** | Keeps the step past level 31 in proportion to the new +1/level slope (41, 43, 45, …), still strictly increasing |
| Enemy `xp` | dart 2→**3**, wisp 2→**3**, blob 3→**5**, spitter 3→**5**, brute 8→**14** (mite 1, blobling 1 unchanged) | These are most of the mix after 2:00. Measured mid-game XP/s (3:00-9:00) went from 0.27 → 0.46, while the first 30 s (mites only) stays at 0.17 |
| Boss `xp` | Warden 80 → **45**, Hive 150 → **90** | A modelled player is level 8 at 3:00 (cost 19 + 20 = 39 ≤ 45), so 2 drafts. At 6:00 they are level 12 (23 + 24 + 25 = 72 ≤ 90), so 3 drafts. At the old values, a kill would have given 4-6 drafts in a row |

**Measured result (competent bot, seeds 1-10, first run, no unlocks):**

| Minute | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| kills/s | 0.41 | 0.54 | 0.37 | 0.13 | 0.25 | 0.21 | 0.16 | 0.34 | 0.19 | 0.34 |
| XP/kill | 0.79 | 1.54 | 1.36 | 3.45 | 1.54 | 2.28 | 2.86 | 1.34 | 2.66 | 2.17 |
| XP/s | 0.32 | 0.83 | 0.50 | 0.45 | 0.39 | 0.49 | 0.45 | 0.46 | 0.52 | 0.75 |
| mean gap (s) | 17 | 17 | 31 | 34 | 46 | 50 | 29 | 83 | 47 | 49 |

| Seed | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Death | 9:39 | 10:19 | 9:32 | 9:39 | 9:46 | 9:32 | 9:22 | 9:46 | 7:36 | 10:03 |
| Level | 12 | 16 | 21 | 17 | 15 | 14 | 21 | 16 | 15 | 15 |
| Mean gap (s) | 54 | 40 | 28 | 34 | 43 | 37 | 27 | 40 | 33 | 37 |

- **Median level-up gap: 22 s** pooled over all gaps (was 53 s). The median of the per-seed mean gaps is 37 s. **Met.**
- Median survival **9:39** (was 7:33). **0/10** died before 3:00. **0/10** wins. 9/10 reached Eclipse (was 4/10), and all 9 died to it.
- The model's average player (`levelUpTimes()`) reaches its first level at 16 s. Its median gap before 9:00 is 40 s and
  its longest gap is 54 s. *(Automated: first draft ≤ 30 s, median gap 20-40 s, no gap over 75 s, at least 12 levels before 9:00.)*

**The shape is still front-loaded.** Gaps are about 17 s in the first two minutes and 30-50 s after 3:00. The pooled median
lands in the band because early gaps are numerous. XP/s drops during the boss windows (kills/s falls to 0.13-0.16 at 3:00 and 6:00),
and `hpMul` keeps rising while XP per enemy does not. A strictly increasing curve can't fix both ends, because early
needs about 21 XP per level and mid about 11. Next levers (they need sim code, so they are Gear's):
1. A per-wave `xpMul` (for example `√hpMul`) so XP scales with enemy toughness.
2. Bosses drip part of their XP at 25% HP thresholds, so a fight that ends with the boss warping out still pays a draft.

**Survival check.** More drafts made the bot sturdier: 9/10 now reach the finale on a first run with no unlocks. It still never
wins, and the median stays under 10:00, so no boss HP was added. Confirm with human playtests that reaching Eclipse on run 1
isn't too generous (§5 targets a first win on runs 5-10).

**Hive stall check.** Farming the brood (1 XP/s in phase 1, 2.1 XP/s in phase 2, for 120 s at most) yields about 190 XP. Killing the Hive
in about 55 s yields 90 + about 80 from the brood + about 30 from 65 s of normal waves, roughly 200 XP, plus 50 ✦ and a heart. Killing still wins.

**Sensitivity.** Every curve entry ±10% moves every gap by about ±10%. The mid-game XP/kill (blob and spitter values) is the most sensitive
input after 3:00. A human who reels well kills faster than the bot: at 2× the bot's kill rate, the gaps halve (8-25 s), and the curve's
+1/level slope only partly absorbs that. Measure with playtest telemetry (level-up gap p50 by minute).

**Open items from M1** (outside this change):
- §1 assumes about 510 kills by 5:00. The measured figure is about 100, so about 0.5 hearts drop, not 2.8.
- §5 models about 30 stardust pickups in a 10-minute run. At the measured kill rate it is about 3, so about 130 ✦ less per full run, roughly 20-25% of a win's income.
  Re-derive both before the store prices are final.

## 5. Stardust: first unlock after about 2 runs, everything after 15-20 runs, first win by run 5-10

Per run: `secondsSurvived/60 × 10 + bosses × 50 + win × 150 + pickups × 5` (pickups modelled from stardustChance, A4).

| Run | Dies at | Bosses | Won | Stardust | Cumulative |
|---|---|---|---|---|---|
| 1 | 4:50 | 0 | – | 88 | 88 |
| 2 | 5:30 | 1 | – | 155 | 243 |
| 3 | 6:00 | 1 | – | 170 | 413 |
| 4 | 7:00 | 1 | – | 195 | 608 |
| 5 | 7:30 | 2 | – | 265 | 873 |
| 6 | 8:20 | 2 | – | 298 | 1 171 |
| 7 | 9:20 | 2 | – | 338 | 1 509 |
| 8 | 9:50 (win) | 3 | ✓ | 548 | 2 057 |
| 9-20 | alternating win (548) / 8:40 loss with 2 bosses (311) | | | | run 17: **6 041** |

- Cheapest item 120 ✦ (Spark trail): 88 after run 1 (not yet), 243 after run 2 → **first unlock after run 2: met**. Reel Arsenal (200) is also affordable then.
- Full catalogue = ships 1 700 + orbs 1 400 + packs 950 + cosmetics 1 930 = **5 980 ✦**, reached at **run 17: met** (target 15-20).
- First Warden kill run 2, first win run 8: **met** (targets 2-3 and 5-10). These follow from A5, which is anchored by the DPS calculation in §2.
- The doubleStardust ad, if taken every run, roughly halves the run count (about run 9). Acceptable, because unlocks are options, not power (P3).

## 6. Dominant-strategy summary (details on each card)

| Strategy | Result | Card |
|---|---|---|
| Edge-circling | Orb loses 50% speed per wall hit; spawns arc inward. Not dominant. | tether-and-orb, wave-director |
| Permanent reel | Held damping 1.5/s kills orb speed in about 1 s. Worse than tapping. | reel |
| Reel pumping | Bounded by maxOrbSpeed 1600 and damping; it is the skill ceiling. | reel |
| One strictly best upgrade | None: each pair trades on a different axis (table in the draft card). Telemetry gate: pick rate > 60% or win-rate delta > 15 pts. | upgrade-draft |
| Tank build | Survives, but bosses escape → less stardust. | health |
| Boss stalling | Leave timer + 0-stardust summons. | bosses |
| Stardust farming | Time-limited by difficulty; overtime collapses. | stardust |

## 7. Tuning knobs (most sensitive first)

1. `critSpeed` (900): moves the crit share (A7), which drives every boss time. ±100 ≈ ±25% boss time.
2. `reelRatio` (0.5): the reel multiplier `1/r`. 0.45 would make crits trivial from 410 px/s.
3. `WAVES[].hpMul`: the late-game tension curve.
4. `xpForLevel` and enemy `xp`: draft cadence (§4, measured). ±10% on the curve ≈ ±10% on every gap.
5. `PROGRESSION.stardust.perMinuteSurvived`: meta pace (§5).
6. `minDamageSpeed` and `PHYSICS.orbDrag`: the new-player passive floor (§8).

## 8. Passive swing floor (a player who never reels)

**Target.** A player who only moves and swings, never reeling, must (a) kill a first-minute mite (20 HP × hpMul 1.0) in
**≤ 2 hits**, and (b) reach **15-25% of pulsed-reel DPS**. Below 15%, the first minute feels broken before the reel has
been learned. Above 25%, the reel stops mattering (P1). Today: 3 / 790 = **0.4%**, so the target fails.

**What the target means in numbers** (P1-P3; `dmg = v × 0.08` at base, non-crit):
- (a) `dmg(v_p) ≥ 10` ⇒ `v_p ≥ 125 px/s` **and** `v_p ≥ minDamageSpeed`.
- (b) At the same hit rate, `DPS_passive / DPS_pulsed = dmg(v_p) / 160`. 15-25% ⇒ `dmg(v_p)` = 24-40 ⇒ **`v_p` = 300-500 px/s**.
- So the gate (`minDamageSpeed` 250, above the passive p50 of 220) is what zeroes passive damage, and the passive speed (220) is what caps the ratio.

| Lever (data only, no new rule) | Passive hit at p50 | Mite hits | Passive / pulsed | Side effects |
|---|---|---|---|---|
| none (today) | 220 < 250 → bump, 0 | ∞ | 0.4% | — |
| `minDamageSpeed` 250 → **150** | 220 × 0.08 = 17.6 | 2 ✓ | 17.6 / 160 = **11%** | Pulsed DPS unchanged (its hits are far above 150). Glancing Blows needs the `STAT_LIMITS.minDamageSpeed.min` floor lowered 120 → **60** to keep all 3 stacks meaningful (150 → 60). |
| `orbDrag` 1.25 → **0.9** (alone) | 220 × 1.25/0.9 ≈ 306 if the whole p50 is swing (first-order lag: steady swing ∝ 1/drag) | 1 ✓ | 24.4 / 160 ≈ **15%** | Raises pulsed DPS too (the ratio shifts less than shown); held damping becomes 0.9 + 1.5 = 2.4/s, so hold is still far worse than pulsing |
| **Both** (recommended) | ≈ 306 × 0.08 = 24.4 | 1 ✓ | **≈ 15-17%** | Inside the band with margin to tune `orbDrag` between 0.8 and 1.0 |

**Recommendation for Gear (integration, t14).**
1. Set `BASE_STATS.minDamageSpeed` 250 → **150** and `STAT_LIMITS.minDamageSpeed.min` 120 → **60**. This is the cheapest fix: it guarantees (a) and doesn't touch reel feel.
2. Re-run the harness. If passive is still < 15% of pulsed, lower `PHYSICS.orbDrag` 1.25 → **0.9** (try 1.0 / 0.9 / 0.8 and keep the highest value that reaches 15%).
3. Accept when, in the harness: passive/pulsed ∈ [0.15, 0.25], a first-minute mite dies in ≤ 2 passive hits, and pulsed > 2× held. Report the three numbers back so this section moves from modelled to measured.

`passiveSwingFloor()` in `balanceModel.ts` encodes this check, and `data.test.ts` asserts that the recommended values pass
under P2/P3 while today's values fail. Gear swaps in measured speeds when available.
