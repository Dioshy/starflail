# Rule card: Stardust (meta currency)

| Field | Spec |
|---|---|
| Purpose | The "one more run" hook (P3): every run, even a bad one, moves you toward a visible next unlock. |
| Inputs | Run end (death or win), stardust pickups collected during the run, the optional doubleStardust ad on the results screen. |
| State | `stardustBalance` (int, persistent save), `runPickups` (int). PROGRESSION.stardust: `perMinuteSurvived` 10, `perBossKill` 50, `winBonus` 150, `perPickup` 5. Stat `stardustGain` 1 (cap 1.5; no v1 content changes it). AD_POLICY `doubleStardustMul` 2. |
| Resolution | **During the run**: enemies roll `stardustChance` on death; the pickup despawns after 30 s; collecting it does `runPickups += 1`. **At the results screen**: `earned = floor((seconds/60 × 10 + bossKills × 50 + (won ? 150 : 0) + runPickups × 5) × stardustGain)` (implemented by `runStardust()`). Time is prorated per second. Show a breakdown (time / bosses / win / pickups). The optional "Watch ad: ×2" makes it `earned × 2`, offered once per results screen (MONETIZATION.md). The balance is saved immediately on reaching results, before the ad button is shown (so a crash or closed tab never loses the base amount); the doubled part is added after the ad's reward callback. |
| Outputs | `stardustBalance += earned`; event `stardustAwarded {base, doubled}`. UI: a counting-up animation and a "Next unlock: Plasma Orb skin 120 ✦ (88 / 120)" progress bar. |
| Sinks | Ships (1 700), orbs (1 400), upgrade packs (950), stardust cosmetics (1 930). **Total 5 980.** No consumables, no repeatable sinks. Once everything is bought, stardust only matters for future content (an intentional end state). |

## Edge cases

| Case | Rule |
|---|---|
| Quit mid-run (close tab) | The run is lost with **no** stardust (no save-scumming). Pause → "Abandon run" goes to results and awards normally (time survived so far). |
| Second Wind used | Time keeps counting; no penalty. |
| Overtime | Minutes past 10:00 still count (prorated), so the payout grows slowly while the danger grows fast. |
| Ad fails / no fill | The button shows "Ad unavailable"; base stardust is already banked. |
| Supporter | Sees the same optional ×2 ad as everyone. `noAds` removes forced interstitials only, so money never buys unlock speed (MONETIZATION.md). |
| Platform without an ad SDK (own site, itch.io) | No ×2 button. The economy targets (balance.md §5) assume no doubling. |
| Integer overflow | The balance is stored as a JS number; max plausible is far below 2^53. |

## Tests (given / when / then)

1. Given 90 s survived, 0 bosses, 0 pickups, then 15. *(Automated.)*
2. Given a 10:00 win, 3 bosses, 10 pickups, then 100 + 150 + 150 + 50 = 450.
3. Given stardustGain 9 requested, then it is clamped to 1.5. *(Automated.)*
4. Given the results screen, when the tab closes before the ad, then the base amount is already saved.
5. Given doubleStardust accepted and rewarded, then the balance increases by `earned` a second time, once only.

## Dominant-strategy review

- **Farming by idling**: per-minute pay requires being alive, and difficulty ramps, so idling dies fast. No farming loop.
- **Overtime farming**: +10 stardust/min against +15% HP and +10% spawns every 30 s. The marginal value collapses within about 2 minutes. Bounded.
- **Ad farming**: the doubler is once per run and requires a real run, so it is bounded by run length (≤ 2× a normal run).
