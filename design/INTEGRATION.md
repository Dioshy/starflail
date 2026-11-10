# Integration notes (Gear)

Where the build deliberately reads a card in its simplest way, or cuts scope.

- **Orb drag** is applied to velocity *relative to the ship* (tether-and-orb.md). Hit speed `v` is the orb's absolute speed.
- **Ship reaction force** from the tether (`shipMass`) is not simulated (greybox was tuned without it).
- **One orb speed loss per orb per tick** (8%), not per enemy hit, so a crowd can't drain the orb in one frame.
- **Second Wind** is cut here (ad-gated; no ads in this task). `AD_POLICY` is untouched for the monetization task.
- **Boss off-screen edge arrow** cut; the warning banner + alarm + stinger are in. Boss warning starts `bossWarningSec` before the event time, boss spawns at `atSec`.
- **Level-up slow-mo** replaced by a 0.25 s burst, then the draft opens (input locked 0.35 s so a held reel button can't pick).
- **Endless mode** after the Eclipse is cut (overtime scaling after 600 s is in `director.ts`).
- Hearts pickup/magnet drops follow `PICKUPS.dropChance`; mote cap merges into the oldest mote.
- First launch skips the hangar (GDD 7). Dev params: `?seed ?skipTo ?god ?stress ?auto ?debug ?screen=hangar|title|results ?give=N ?draft=1`. Runs with `god`, `stress` or `skipTo` never write to the save.
- Store button: placeholder `[data-slot="store-button"]` in `HangarScreen` (src/ui/screens.ts).

## Balance pass (post-review)

Data numbers changed (all in `src/data/stats.ts`, authorised by Muse, balance.md s8):
- `BASE_STATS.minDamageSpeed` 250 -> **150**; `STAT_LIMITS.minDamageSpeed.min` 120 -> **60**.
- `PHYSICS.orbDrag` 1.25 -> **0.75** (0.9 gave 11% passive/pulsed, 0.8 gave 15%, 0.75 gives 17% on 6 seeds).
- `src/data/data.test.ts`: the two bump/exact-threshold assertions now use 149/150 (damage 12) instead of 249/250.

Measured by `tests/passive-floor.test.ts` (ship circling the tight ~76 px circle of reel-skill.test.ts, 6 seeds x 60 s, crowd of 80):
passive 6.2 dps (median contact 265 px/s), pulsed 36.2 dps (median 646), held 10.9 dps -> passive/pulsed **17.0%**, pulsed/held **3.31x**, a first-minute mite (20 HP) dies in **1** passive hit.
Caveat: on a wide circle (rate <= 0.7, tether taut) an unreeled orb already swings at 600+ px/s and out-damages fixed-phase pulses.

Competent bot (`tests/competent-bot.test.ts`, 10 seeds, no unlocks): median survival 7:33 (3:23 - 10:43), 0/10 deaths before 3:00,
so first-120 s data was NOT softened. Level-up gap median 53 s vs the 20-40 s target: kill rate (~0.4/s) lags the modelled XP rate.

## Polish-1 (Gear)
- Merged Hue's art-readability (t20): telegraphs go through `A.drawTelegraph` (2.5 Hz sine, no 4 Hz toggle for anyone); Reduced Flashes passes `steady` so the pulse holds at mid-brightness while rings/lanes still animate. B6 (Mite vs Dart) fixed by the new silhouettes.
- `?skipTo=N` is now sliced across frames (40 ms budget) instead of one blocking loop.
- Warden HP 4000 -> 3000 (bosses.md, balance.md s8).
- **Open for Sage (M3, novice cliff):** non-dodging play still dies at 0:30-0:60 (idle-circler median 0:48 after the minute-1 spawn -25%); cause is Mite/Dart contact with 5 HP and 1 s i-frames. No HP rule added yet; options: +1 HP on runs 1-2, softer Dart in minute 1, telemetry first.
