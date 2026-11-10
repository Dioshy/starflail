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
