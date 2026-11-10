# STARFLAIL — Art direction

Neon vector glow on deep navy. All art is procedural Canvas 2D (`src/render/art/`), no binary assets.

## Palette (`PALETTE` in `palette.ts`, mirrored in `theme.css`)
| Role | Hex |
|---|---|
| Space bg | `#050816` → `#0a1030` → `#111c52` (radial) |
| Grid / stars | `#2a3d9a` / `#9fb4ff` |
| **Player family (cool only)** | cyan `#35e6ff`, deep `#0a8fb3`, white `#f4fbff` |
| mite / dart / wisp / blob / blobling / spitter / brute | `#ff4d5e` / `#ff8a1f` / `#b36bff` / `#a6ff2e` / `#c9ff6b` / `#ff3fa4` / `#ff5a3a` |
| warden / hive / eclipse | `#ff7a1a` / `#9dff3a` / `#c07bff` |
| Pickups | xp `#4dffc4`, heart `#ff7a9c`, magnet `#6aa8ff`, stardust `#ffd166` |

Rule: nothing hostile is cyan; the player ship, tether and orb are the only cyan-white things on screen.

## Shape language (enemies differ by shape AND motion)
mite = small SOLID filled, round-edged red triangle that wiggles · dart = long thin HOLLOW yellow arrowhead (~1.6:1) with a permanent tail streak (longer while dashing); telegraph = steady breathing ring + scale pulse, no white flicker · wisp = flickering rotating broken ring · blob = wobbly circle with nucleus (blobling smaller/faster wobble, no nucleus) · spitter = hexagon with a mouth that opens/glows before spitting · brute = heavy armored square with rivets, slits glow on telegraph.
Bosses: warden = octagon + 4 orbiting plates (plates pull out on telegraph, spin on attack) · hive = hex core + 6 pulsing pods (swell on telegraph, solid on attack) · eclipse = black disc + counter-rotating corona arcs and crescent (corona expands on telegraph, radial spikes on attack).
Projectiles: spit = small magenta blob; bossBolt = larger spinning diamond with white core.
Pickups: xp = diamond (big has ring), heart = heart, magnet = horseshoe, stardust = 8-point gold star.

## Readability rules
1. Enemy outline 2–4 px bright, body fill very dark — silhouettes read at 300+ on screen.
2. Telegraph = smooth sine pulse (<= 2.5 Hz, `TELEGRAPH_HZ`) of glow/scale plus a NON-flashing cue that carries the meaning; attack = distinct extra geometry (streaks, open mouth, spikes), never only color.
2a. Never alternate full-bright and dark frames, anywhere. Pulses breathe between ~70-100 % alpha. Nothing in art/fx exceeds 3 Hz. This holds for everyone (the art API has no settings parameter), so Reduced Flashes needs no extra handling for telegraphs.
2b. Hit flash (`HIT_FLASH_MAX_ALPHA` = 0.45) is a white overlay for ~90 ms only, peak alpha capped.
2c. Mite vs Dart: silhouette first (solid short triangle vs long hollow arrowhead + tail streak), colour second (crimson #ff3050 vs yellow #ffe14d, very different luminance, so it survives red-green colour blindness).
3. The orb has a white-hot core and the biggest glow; it grows with speed01 and gets a halo ring above 0.7.
4. Every ship skin keeps a white cockpit and a cyan nose dot, so the player is findable regardless of skin.
5. Glow = cached radial sprite blitted additively. No `shadowBlur` per entity.

## Skins (cosmetic only — no hitbox, size or contrast change)
Ship: default, neon, ember, void, gold (supporter shimmer). Orb (also tints tether): default, plasma, ice, molten, prism (supporter, rainbow spokes). Trails: none, spark, ribbon, pixel, rainbow (supporter). `pts` for trails are x,y pairs oldest → newest.

## FEEL rationale (`src/fx/feel.ts`)
Hit-stop is 0 for normal hits (300 enemies would freeze the game), 22 ms kills, 45 ms crits, 85 ms player hurt. Shake scales with stakes (boss death 18 px, slow decay). Hit flash 90 ms; damage numbers live 650 ms (crit 900 ms, larger).

## Performance
Measured in the preview (`?stress` → 400 enemies + 1000 particles + arena + ship + orb): ~1.3 ms/frame draw (re-measured after the telegraph rework); gallery ~0.7 ms.


## Telegraphs (`src/render/art/telegraph.ts`, `drawTelegraph`)
World-space telegraph for every enemy/boss pattern. Steady danger colour; brightness breathes with a 2.5 Hz sine, never toggles. Meaning is carried by shape, not flashing:
- **Lane** (dart, wisp, brute, warden charge): constant outline, a fill that grows from the enemy to the tip as the telegraph runs out, chevrons at the tip showing direction. Plus a **charge ring** around the enemy whose arc sweeps a full circle exactly when the attack fires.
- **Spitter**: aim line with arrow tip + charge ring. **Warden ring**: spokes + charge ring. **Hive volley**: filled cone with solid edges + ring. **Eclipse spiral/well**: steady arms / growing well + ring.
- **Eclipse blink**: dashed path boss -> destination, X crosshair on the landing point, dark zone disc that fills red from the centre, a steady outer ring, a converging inner ring and a white sweep ring around the destination, all for the full telegraph duration.
- `drawEnemy` in the `telegraph` state adds a breathing warning ring and soft body pulse (no white flicker); bosses keep plate/pod/corona swell via the same sine.
Integration: `src/game/render.ts` `drawTelegraph` should just build the args and call `A.drawTelegraph` (patch in `preview/wire-telegraph.patch`, applies to the game as of 438593a; src/game is not owned by Hue).
