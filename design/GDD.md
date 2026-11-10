# STARFLAIL — Game Design Document

Status: v1 design, all numbers **modelled** (not yet playtested). Data: `src/data/` (single source of truth).
Rule cards: `design/mechanics/`. Economy derivations: `design/mechanics/balance.md`. Money: `design/MONETIZATION.md`.

## 1. Pitch

**You never shoot. You swing.** STARFLAIL is a 2D top-down neon arcade roguelite for the browser. Your little ship drags a
heavy orb on an elastic tether through a horde. The faster the orb is moving when it hits, the harder it hits. Hold
**REEL** to yank the tether short: the orb whips around faster, like a skater pulling in their arms, and crits light up the
screen. Survive 10 minutes, beat three bosses, and spend stardust on new ships, orbs and looks for the next run.

- Genre: horde-survival roguelite ("bullet-heaven"), with one active skill input instead of auto-fire.
- Platform: browser (desktop and mobile), 1280x720 logical view, circular arena of radius 1600 px.
- Session: 10-minute runs. Short enough for a break, long enough to build something.

## 2. Pillars (from Muse; every rule below traces to one)

| # | Pillar | What it means for design | What it rules out |
|---|---|---|---|
| P1 | **Momentum is the weapon** | Damage = orb speed. Every upgrade changes how you build or use speed. | Auto-attacks, flat-damage weapons, standing still and winning. |
| P2 | **Readable, juicy chaos** | Every attack has a telegraph of at least 0.6 s, crits look and sound different, no off-screen one-shots. | Instant-hit attacks, unreadable bullet walls, damage you can't trace. |
| P3 | **One more run: unlocks give OPTIONS, not power** | Ships, orbs and upgrade packs are sidegrades with real downsides. A new player and a veteran with the same picks are equally strong. | Permanent stat upgrades, "+5% damage forever" meta trees. |
| P4 | **Fair monetization** | Cosmetics, a Supporter Pack and optional rewarded ads only. | Pay-to-win, loot boxes, premium currency, ads during a run. |

## 3. Target player

Casual-to-midcore web and mobile players who enjoy horde-survival games (short runs, upgrade drafts, screen-filling
chaos) but want **an active skill** in place of auto-fire. They play in 10-minute sessions on a laptop or a phone,
often on portals (CrazyGames, Poki, itch.io). They will not read a tutorial; the first 60 seconds must teach the swing.

## 4. Core loop

**One sentence:** *Move to swing the orb, reel at the right moment to spike its speed, smash enemies for XP, and draft
upgrades that change how your swing works, until a boss tests what you built.*

```
MICRO LOOP (2-5 s)                     RUN LOOP (~10 min)                    META LOOP (between runs)
+--------------------------+           +----------------------------+        +---------------------------+
| steer ship               |           | waves ramp (sawtooth)      |        | results: stardust earned  |
|   -> orb swings behind   |           |   -> XP motes              |        |   (+ optional 2x ad)      |
| read telegraph / aim arc |  kills    |   -> level-up every 20-40 s|  run   |   -> hangar: buy ship /   |
|   -> REEL (hold)         | ========> |   -> draft 1 of 3 upgrades | =====> |      orb / upgrade pack / |
|   -> orb speeds up x2    |   XP      |   -> boss at 3:00 / 6:00 / |  ends  |      cosmetic             |
|   -> hit: dmg = speed    |           |      9:00 (Eclipse = win)  |        |   -> pick loadout         |
|   -> crit flash, pop     |           |   -> death / win          |        |   -> next run             |
+----------^---------------+           +-------------^--------------+        +-------------+-------------+
           |  new enemy positions                    |  new build changes the micro loop      |
           +-----------------------------------------+----------------------------------------+
```

The micro loop must be fun with zero upgrades. Upgrades bend the micro loop (longer arcs, reel shockwaves, chain crits),
and the meta loop adds options (new ships, orbs, upgrade packs), never raw power.

## 5. Controls (device-neutral intents: `Move`, `Reel`, `Pause`, `Confirm`)

| Intent | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD or arrow keys | Left stick | Floating virtual joystick (left half of screen) |
| Reel (hold) | Space, Shift, or right mouse button | A (South) | Reel button, bottom right, 96 px, hold |
| Draft pick | 1 / 2 / 3, or click | D-pad + A | Tap card |
| Reroll draft | R | Y (North) | Reroll button |
| Pause | Esc / P | Start | Pause icon top-right; auto-pause on tab blur |

Rules: Reel is a hold, never a toggle (an accessibility option "Reel toggle" is allowed; see open questions). Movement is
analog on stick and touch (magnitude scales speed, dead zone 0.15), digital on keys (normalised diagonal).

## 6. Win and lose

- **Lose:** ship HP reaches 0. One **Second Wind** per run may revive you (MONETIZATION.md; free where ads don't exist).
- **Win:** kill **Eclipse** (spawns at 9:00). The run ends immediately on the kill, including in overtime (after 10:00).
- Warden (3:00) and Hive (6:00) are optional to kill: if alive 120 s after spawning they warp out with no reward.
- After 10:00 with Eclipse alive: **overtime**; the 9:00 wave keeps running with HP +15% and spawns +10% every 30 s.

## 7. Session flow

```
Title --(any input)--> Hangar --(Launch)--> Run --(death/win)--> Results --(Continue)--> Hangar
                         |  ^                 |                    |  optional: "Watch ad: 2x stardust"
                         |  +-- Shop/Codex    +-- Pause menu       +-- interstitial only here, and only per AD_POLICY
                         +-- Settings
```

| Screen | Purpose | Key elements |
|---|---|---|
| Title | Mood, one input to start | Logo, animated orb swing, "press any key / tap" |
| Hangar | Loadout + meta | Ship, orb, cosmetic slots; stardust balance; Shop (unlocks, packs, Supporter); Codex of seen enemies |
| Run | The game | HP pips, XP bar + level, timer with boss pips at 3/6/9 min, stardust counter, reel indicator |
| Results | Closure + reward | Time, kills, bosses, max orb speed, build summary, stardust breakdown, 2x button, Continue |

First-time flow: Title > Run directly (skip hangar on the very first launch; loadout is all defaults) with three
one-line contextual hints (move, reel, draft) shown the first time each is relevant.

## 8. MDA

| Aesthetic (what the player feels) | Dynamics (what emerges in play) | Mechanics (rules and data that cause it) |
|---|---|---|
| **Mastery / flow**: "I'm getting good at swinging" | Players learn to circle-strafe, then to time reels into crowds; skilled play visibly kills faster | damage ∝ speed, reel conserves angular momentum, crit at 900 px/s, held-reel damping (reel.md) |
| **Sensation / juice**: the crit crunch | Players chase big crits because they look and sound great | crit multiplier ×2, crit-only VFX/SFX, hit-stop on crits (Hue/Gear) |
| **Tension and release**: sawtooth pacing | Pressure builds to a boss, the boss wave is lighter, then a higher ramp | WAVES ramp + breather waves at boss times, telegraphs ≥ 0.6 s (wave-director.md) |
| **Discovery / expression**: "what if I build for tether cuts?" | Builds diverge: crit-chain, tether-barbs, heavy knockback, twin coverage | 25 upgrades, 8 behaviors, draft 1 of 3 with rarity weights (upgrade-draft.md) |
| **Fellowship-lite / goal**: "one more run" | Short runs + visible next unlock | stardust per minute/boss/win, cheapest unlock after ~2 runs (stardust.md) |

## 9. Content summary (all in `src/data/`)

| Kind | Count | File |
|---|---|---|
| Enemies | 7 (mite, dart, wisp, blob, blobling, spitter, brute) | `enemies.ts` |
| Bosses | 3 (warden 4 000 HP, hive 9 000 HP, eclipse 18 000 HP) | `enemies.ts` |
| Waves / events | 11 contiguous waves 0-600 s; 9 events | `waves.ts` |
| Upgrades | 25 (14 common, 7 rare, 4 epic); 8 behavior, 7 reel/tether; 19 in the default pool | `upgrades.ts` |
| Ships / orbs | 4 / 4 (first of each free) | `loadout.ts` |
| Meta unlocks | 3 upgrade packs (200 / 300 / 450 stardust) | `progression.ts` |
| Cosmetics | 15 (5 per slot: 1 free, 3 stardust, 1 supporter) | `shop.ts` |
| SKUs | supporter_pack €4.99; 2 cosmetic bundles €1.99 | `shop.ts` |

## 10. Feedback loops

| Loop | Type | Cap / counter |
|---|---|---|
| Kill → XP → upgrade → kill faster | Positive | All stats clamped (STAT_LIMITS); enemy hpMul ramps 1.0 → 3.2; maxOrbSpeed 1600 |
| More enemies alive → more orb targets → more XP | Positive | maxAlive per wave; hardEnemyCap 220 |
| Getting hit → i-frames 1 s | Negative | Prevents chain-hit deaths from a crowd |
| Boss alive → lighter wave | Negative | Breather so boss attacks stay readable |
| Run stardust → unlocks | Positive (meta) | Unlocks are sidegrades only (P3), so no power snowball across runs |

## 11. Out of scope for v1

Endless mode (overtime already defines its scaling), daily seeded runs, leaderboards, multiplayer, accounts/cloud save,
narrative. Each is a natural post-launch addition; none is required for the loop to be fun.

## 12. Open questions (for Muse / playtest)

1. Reel release is symmetric (the speed gained on reel is lost on release). A "slingshot" variant that keeps 25% of
   the gain is the first thing to A/B in playtests if reel feels like it gives nothing back.
2. Should a "Reel toggle" accessibility option exist? It enables permanent reel, which held-reel damping already makes
   weak, so it looks safe; confirm in playtest.
3. Does the first run skip the hangar? Recommended yes.
