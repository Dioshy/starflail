# STARFLAIL — Playtest & QA Report 1 (Pip)

Build under test: `3006465` ("release docs, dev params…"), which already contains the monetization layer (feat/monetization is merged in this history; `main` itself is only the initial commit). Date 2026-11-10.
Branch: `dioshy/pip-full-playtest-and-qa-report-9e4571` (the instructed name `playtest/report-1` was not created: the task runs in a pre-made worktree on this branch). No game code was changed. Scripts: `playtest/bots.ts`, `playtest/upgrades.ts`, `playtest/edge.ts`, `playtest/edge-longrun.ts`, `playtest/e2e.mjs`.

## 0. Verdict

**Fun: promising, not yet proven. Publishable: not yet.**

What I could confirm: the core look is strong (neon, readable shapes, a bright orb, clear red telegraph lanes), the tooling is solid (122 tests green, build 52 kB gzip, 60 fps at 400 enemies), the save system survives corruption, and the monetization gate behaves as specified. The "never shoot, swing" hook is communicated in the first 3 seconds.

What stops me signing off:
1. **The first minute is lethal for anyone who does not dodge.** Three bots that don't dodge (idle-circler, aggressive reel-spinner, and my crude scripted keyboard play) die at **0:26–0:55** against a design target of 4–7 min. A human will dodge better than my scripts, but nothing in this build proves a novice survives to 4 min. I could not test a human.
2. **The pacing fix is not in this build.** At `3006465` the competent bot levels up every **53 s** (target 20–40 s). Sage's branch `dioshy/sage-retune-xp-pacing-to-the-mea-97bd21` (commit `92ef504`) fixes this (I re-ran my bots on it: **22 s**), but it is not merged here.
3. **An AFK exploit exists**: hugging the arena wall survives **60+ minutes at level 1** on 2 of 10 seeds, banking 10 ✦/min indefinitely (§4).
4. **Pressing/pulsing the reel key (Space) on the results screen starts a new run immediately** (§3, B1), so mashers skip the results, unlock hint and Double-Stardust offer.
5. **Boss kills and a win were never demonstrated** by any bot (0 boss kills in 40 bot-runs), so "first boss by run 2-3" and the win loop are **untested** here.

## 1. Build health (commands and output)

| Command | Result |
|---|---|
| `npm ci` | OK (only npm warnings about unapproved install scripts for esbuild/fsevents) |
| `npm run typecheck` | OK, 0 errors |
| `npm test` | **12 files, 122 tests passed**, 12.2 s |
| `npm run build` | OK: `dist/index.html` 1.10 kB, CSS 15.85 kB (4.09 gz), JS 155.94 kB (**51.62 kB gz**), built in 365 ms |

Console errors: the only error on every page was `unhandled promise rejection: Command plugin:notification|is_permission_granted not allowed by ACL`. It comes from the screenshot tool's host wrapper (a Tauri API); `grep -ri notification src index.html` finds nothing, and the Playwright runs in plain headless Chromium logged **zero** page errors on every scenario. Not a game bug.

## 2. Pillar scores

| Pillar | Score | Evidence |
|---|---|---|
| 1. Momentum is the weapon | **4/5** | Damage ∝ orb speed, speed meter with damage/crit ticks, orb colour changes. Pulsed reel beats hold (test `reel-skill`). Real-input run: orb reached 1600 px/s (cap) within 14 s. Minus 1: bots show "do nothing smart" is not punished early *and* wall-hugging is never punished late (§4). |
| 2. Readable, juicy chaos | **4/5** | At 400 enemies (`?debug=1&stress=400`) every type is still distinguishable by silhouette + colour (red/orange arrows, green blobs, magenta hexagons, orange diamonds, purple rings); orb is white-cored and the brightest object. Telegraph data ≥ 0.6 s (validated by `validateData`, min 0.6 s for Wisp lunge and Spitter, 0.7–1.0 s for the rest). Minus 1: Mite (red triangle) vs Dart (orange arrowhead) are close in shape and hue (colour-blind risk); reduced-flash does not cover the 4 Hz telegraph strobe (B5). |
| 3. One more run | **3/5** | Restart is fast: 0.85 s death cam → results → GO AGAIN is one press (restart ≈ 1 s, under 2 s ✓). First unlock at 120 ✦ is visible on results. But: 10-min runs only happen for competent-bot play after Sage's retune; at this build median is 7:33 and novices die in 30–50 s with no recovery tool. Space-skips-results bug (B1) undermines the "next unlock" beat. |
| 4. Fair monetization | **4/5** | No stat-affecting SKU, no premium currency, no timers, real prices, restore button, base stardust banked before the ×2 button. Ads never fire during a run. Minus 1: "No thanks" is 185 px wide vs "Watch ad & revive" 271 px (both 55 px tall) while the doc requires equal size (B4); the ×2 button label is the only ad entry on results (fine). |

## 3. Bugs (ranked)

### Blocker
None found that crash the game or lose data. (Closest: the unmerged pacing branch, see M1.)

### Major
- **M1. Level-up cadence misses the target at this commit.** Competent bot, seeds 1–10: median gap **53 s** (individual seeds 44–137 s), deaths 3:23–10:43. Target 20–40 s. *Repro:* `npx vite-node playtest/bots.ts` (row "competent"), or `npm test` (prints `COMPETENT BOT`). *Fix:* merge `92ef504` (re-verified by me: median gap **22 s**, median survival **9:39**, level 16, 0 deaths before 3:00). Caveat: after that retune the bot dies to **Eclipse blink in 9/10 seeds**; the bot does not dodge it, so it is a bot limitation, but also check that blink (0.9 s telegraph, 2 dmg) is learnable.
- **M2. AFK / wall-hugging exploit.** A bot that circles at radius 1450 and pulses reel survives **15:00+ on 2/10 seeds** (seeds 4, 6) with 4–6 kills and level 1; run to 60 min (`playtest/edge-longrun.ts`): still alive, **600 ✦** banked, bosses spawned at 180/360/540 and ignored it. The design (balance.md §6) says "overtime collapses" and edge-circling "not dominant"; neither holds. Stardust is uncapped in time (`runStardust` prorates seconds). Impact: it is options-only currency (P3), but it is a no-skill unlock farm and a fake "survived 60 min" best time. *Repro:* `npx vite-node playtest/edge.ts`. *Fix:* cap time-based stardust at the run length (10 min) or require kills/level; make overtime and Eclipse pressure target the player's position (hunters ignore arena-edge ring); cap `bestTimes.survivedSec` display at win/overtime.
- **M3. Novice cliff.** Bots that don't dodge die at 0:26–0:55 (idle-circler median 0:43, aggressive reel-spinner 0:41, cause Mite ×6–9 / Dart ×1–4). My scripted keyboard play (WASD circle + Space pulses, seed 1, no dodging) went hp 5→2 by 19 s and was dead at **26.6 s** (`playtest/e2e.mjs`, scenario A). balance.md §1 assumes 0.3 hits/min in minute 1 for a novice. I cannot say a real novice behaves like these bots, but the margin for a bad first 30 s is thin (5 HP, 1 s i-frames). *Fix suggestion (Sage):* first-minute spawn rate −25%, or +1 HP for run 1–2, then telemetry.
- **M4. Boss kill / win never demonstrated.** 0 boss kills across 40 bot runs (all styles), 0 wins. "First boss by run 2-3" and "win by run 5–10" (balance.md §5) are **untested**; the bot never focuses bosses. Need a human or a boss-aware bot before launch.
- **B1. (UX, major) Reel key restarts the game from the results screen.** `game.ts:355` triggers `startRun()` on `intents.confirm`, and `input.ts:102` maps **Space** (the reel key) to confirm on any non-repeat keydown; there is no input lockout (the draft has a 350 ms lock, results does not). *Repro:* `?seed=1&debug=1`, pulse Space/WASD until you die (≈25 s); the results screen appears at ≈0.85 s after death and the next Space tap starts a new run. Observed in `e2e.mjs` A: dead at t=26.6 → new run (hp 5, t=28.7) 2 s later while only reel pulses were being sent. Consequence: stardust is banked, but the results, next-unlock and Double-Stardust offer are skipped for anyone mashing reel (it also hits the ad revenue path). *Fix (Gear):* ignore confirm for 600 ms after results opens, and never bind Space on results (use Enter / click only).

### Minor
- **B2.** `?screen=store` shows a pure-black background; hangar and title show the starfield. Cosmetic (canvas not drawn in the `store` state).
- **B3.** Hangar/store on 1280×720 leave the right 50 % empty (hangar shows a ship preview, store shows nothing). Fine on mobile (single column, 390×844 looks good).
- **B4. (ethics deviation) "No thanks" smaller than "Watch ad & revive"** (185×55 vs 271×55 px). MONETIZATION.md §2/§3.4 says equal size. *Fix (Hue):* same width/class.
- **B5.** Telegraph flash toggles at 4 Hz (`render.ts:153`, `floor(t*8)%2`), above the 3 Hz general flash limit, and is not affected by "Reduced flashes". Make it a steady glow or slower pulse when the setting is on.
- **B6.** Mite and Dart silhouettes are both triangular and red/orange: add a distinguishing mark or colour (Hue).

## 4. Headless balance (10 seeds each, first run, no unlocks; `npx vite-node playtest/bots.ts`)

Results at the commit under test (`3006465`):

| Style | Survival min / median / max | Level (median) | Bosses killed | Wins | Median level-up gap | Cause of death |
|---|---|---|---|---|---|---|
| idle-circler (circle, never reels, random drafts) | 0:32 / **0:43** / 0:52 | 1 | 0/10 | 0/10 | no level-ups | Mite ×6, Dart ×4 |
| edge-hugger (wall ring, pulsed reel, random drafts) | 2:33 / **3:01** / **15:00+** (2 seeds immortal) | 1 | 0/10 | 0/10 | no level-ups | Dart ×4, Warden ×2, Hive ×1, Blob ×1, **alive ×2** |
| aggressive reel-spinner (dives at nearest enemy, no dodge, 20/20 pulses) | 0:26 / **0:41** / 0:55 | 2 | 0/10 | 0/10 | 22 s | Mite ×9, Dart ×1 |
| competent bot (existing `bot.ts`, priority drafts) | 3:23 / **7:33** / 10:43 | 6 | 0/10 (bosses spawned: Warden 10, Hive 7, Eclipse 4) | 0/10 | **53 s** | Eclipse blink ×4, Spitter ×2, Mite ×2, Hive ×1, Warden ×1 |

After Sage's retune (`92ef504`, run by me in a temporary detached worktree, same scripts):

| Style | Survival min / median / max | Level | Wins | Median gap | Cause of death |
|---|---|---|---|---|---|
| idle-circler | 0:32 / 0:43 / 0:52 | 1 | 0/10 | – | Mite ×6, Dart ×4 |
| edge-hugger | 2:33 / 3:01 / 15:00+ | 1 | 0/10 | – | unchanged (exploit remains) |
| aggressive reel-spinner | 0:26 / 0:49 / 1:13 | 4 | 0/10 | 13 s | Mite ×6, Dart ×4 |
| competent | 7:36 / **9:39** / 10:19 | 16 | 0/10 | **22 s** | Eclipse blink ×9, Hive ×1 |

Against balance.md targets:

| Target | Measured (this commit) | Verdict |
|---|---|---|
| First-run death at 4–7 min | competent 7:33 (above range, high-skill); non-dodging play 0:26–0:55; edge-hugger up to ∞ | **Not demonstrated**: range only met by neither extreme |
| First boss beaten by run 2–3 | 0 boss kills in 40 runs | **Untested** |
| Level-up every 20–40 s | 53 s (this commit) → 22 s (Sage's branch) | **Fail → pass once merged** |
| No degenerate safe strategy | Wall-hugging is immortal on 20 % of seeds | **Fail** |

Upgrade dominance probe (`npx vite-node playtest/upgrades.ts`, forced pick of each upgrade, competent movement, 8 seeds): **inconclusive**. Median times each upgrade is even offered per run is 0–2, so differences (−275 s for Spiked Shell … +14 s for Nanorepair) are RNG-stream noise, not causal. Random draft picks gave a *higher* median (9:08) than the bot's priority list (7:33), which suggests the bot's priority order, not the upgrades, is the issue. I cannot name a dominant pick; I can only say no upgrade shows an effect larger than noise. Need telemetry (pick rate > 60 % gate in balance.md §6) from real players.

## 5. Performance (real Chromium headless, swiftshader GL, 1280×720, `playtest/e2e.mjs` B)

| Enemies | Sim ticks/s (target 60) | rAF fps | Debug overlay sim+draw |
|---|---|---|---|
| ~4 (stress 0) | 59.99 | 60.2 | 0.38 ms/frame |
| 200 | 59.98 | 60.2 | – |
| **400** | 59.72 | **57.3** | **2.97 ms/frame** |
| 500 (max) | 59.83 | 49.9 | – |

Software-rendered GL, so a real GPU should be faster; the 400-enemy case holds ~57 fps, 500 drops to ~50. The screenshot tool's own browser capped at 30 fps; ignore that figure. Real-input run (WASD + Space, 40 s): 60.3 fps. Phone-sized (390×844) renders correctly; I could not measure phone-class CPU.

## 6. Checklist results

| Check | Result |
|---|---|
| Onboarding within 30 s | **Pass.** Hint "Move to swing your orb" at 0.5 s; vanishes on first move; "Hold SPACE to reel…" appears ≈2.5 s later; gone after the first reel. Both taught by ~8 s. |
| Telegraph ≥ 0.6 s | **Pass (data).** `validateData` enforces it; values 0.6–1.0 s. I did not time them in the running sim. |
| Enemies distinguishable by shape at 300+ | **Mostly pass** (see B6: Mite/Dart close). |
| Orb brightest object | **Pass** in all screenshots (white core + cyan glow); stardust pink dots are the next brightest. |
| Hit punch | **Pass by code review**: crit hitstop 45 ms, kill 22, boss 30, player hurt 85 ms; shake crit 3 px, boss death 18 px; particle bursts (crit/death 12–26); pitch-scaled hit/crit SFX capped at 5 per frame. I cannot hear audio or judge the feel by eye. |
| Music reacts to intensity | **Pass by code**: `setIntensity(0.18 + enemies/110)` capped 0.7, boss 0.92, smoothed; stingers for boss/victory/defeat. Not audible-tested. |
| Shake-off / reduced-flash | **Pass**: setting stored → `renderer.opts` becomes `{shake:false, reducedFlashes:true}` after reload; `shake()` early-returns; crit and level flashes skipped; hurt vignette reduced to 0.25. Gap: B5. |
| Upgrade variety / dominant pick | **Inconclusive** (§4). Draft shows rarity, 3 cards, reroll ×1, stat deltas ("Reel ratio 0.5 → 0.45"); clear. |
| Save persists | **Pass**: `give=300` → reload → 300 in `starflail.save`. |
| Corrupt save recovers | **Pass**: truncated JSON → hangar loads with 0 ✦, original moved to `starflail.save.bak`; wrong-typed fields (`stardust:"lots"`, `unlocks:5`, `settings:null`) load without error; `version:99` loads without error and is left in storage untouched (not verified what the UI does with its 7 ✦). |
| Mock purchase / restore | UI present (Buy €4.99 / €1.99 ×2, Restore purchases); covered by the passing `monetization.test.ts`. I did not complete a mock checkout in the browser. |
| Second Wind once per run | **Pass.** `?seed=5&die=4&mockAuto=1`: prompt after death, revive → full HP (5/5), second forced death goes **straight to results with no second prompt**. |
| Double Stardust | Offer visible on results ("Double stardust (+116 ✦) · watch an ad"); base +113 shown and banked before the button (code: `recordRun` precedes `show`). Not clicked in the browser. |
| Interstitial rules | **Pass.** Mock provider, 7 consecutive quick runs: ad on the Results→Hangar after run **3** only (none on runs 1–2; none on 4–7 because the 180 s gap blocks them). With `own=supporter_pack`: **0 ads in 7 runs**. |
| Nothing purchasable affects stats | **Pass (by data)**: `CosmeticDef` has no stat field, validated; store copy says so. Hangar ships/orbs are sidegrades unlocked with stardust only. |
| Touch controls | **Pass (emulated).** 390×844 touch context: REEL button visible 96×96 px at the bottom right; synthetic CDP touch drag moved the ship (x 0 → 397). Not tested on a real phone; multi-touch (drag + reel at once) not tested. |

## 7. Monetization ethics check

- No pay-to-win: pass. Supporter Pack, bundles = cosmetics + `noAds`; none touches stats, draft or stardust.
- No loot boxes, no premium currency, real € prices, no countdown/scarcity: pass (store screenshot).
- Ads never during a run, in a draft, pause or title: pass (policy gate + e2e).
- Supporters get **no** interstitials: pass (0/7). They still see Second Wind free: pass by code (`noAds` → 'free').
- Bundle overlap message ("You own 2 of 3"): not checked in the UI.
- **Fail:** equal-size "No thanks" (B4).
- Risk: the Second Wind prompt auto-declines after 10 s with a countdown; it is an opt-in prompt, not a purchase, so acceptable, but keep it off the touch-reel thumb zone (the REEL button sits where a mash would land).
- Risk: B1 means mashers skip the results screen where the ×2 offer lives. That reduces, not inflates, ad exposure, so it is not an ethics problem but a revenue/UX one.

## 8. Could not test

Real human feel (hit punch, music, audio mix), real phone hardware and gestures, real ad SDKs / Stripe / itch / portal providers, the "You own 2 of 3" bundle copy, Restore in a fresh profile, boss fights as a human, the settings screen toggles by clicking, gamepad, tab-blur autopause, long-run memory/GC. The dev server was left running in the background (my `pkill` was denied).

## 9. Top 5 changes

| # | Change | Owner |
|---|---|---|
| 1 | Merge the XP pacing retune (`92ef504`), then re-run `playtest/bots.ts`; consider +1 HP or −25 % spawns in minute 1 for runs 1–2 so a non-dodging novice survives to 2:00+ (M1, M3). | **Sage** |
| 2 | Close the AFK/wall-hug exploit: cap time-stardust at 10 min or tie it to kills, and make overtime/Eclipse hunt the player (M2). | **Sage** (numbers) with **Gear** (AI targeting) |
| 3 | Add a results-screen input lockout (≈600 ms) and remove Space as "go again" (B1). | **Gear** |
| 4 | Make "No thanks" the same size as "Watch ad & revive"; fix the black store background (B4, B2). | **Hue** |
| 5 | Accessibility/readability polish: slow or steady the 4 Hz telegraph strobe under Reduced Flashes, differentiate Mite vs Dart silhouettes (B5, B6). Then get a boss-aware bot or a human to verify boss kills and the win path (M4). | **Hue** (visuals), **Gear** (boss bot) |

## 10. Top 3 blockers to publishing

1. **Boss and win path unverified** (M4): no run, bot or human, has killed a boss in this report.
2. **Novice survival unproven + pacing fix unmerged** (M1, M3): the first 60 s kills non-dodging play at 0:26–0:55.
3. **AFK stardust exploit + Space-skips-results** (M2, B1): both distort the progression/monetization loop on day one.
