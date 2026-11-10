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
mite = small wiggling triangle · dart = arrowhead, flashes white before dash, speed lines while attacking · wisp = flickering rotating broken ring · blob = wobbly circle with nucleus (blobling smaller/faster wobble, no nucleus) · spitter = hexagon with a mouth that opens/glows before spitting · brute = heavy armored square with rivets, slits glow on telegraph.
Bosses: warden = octagon + 4 orbiting plates (plates pull out on telegraph, spin on attack) · hive = hex core + 6 pulsing pods (swell on telegraph, solid on attack) · eclipse = black disc + counter-rotating corona arcs and crescent (corona expands on telegraph, radial spikes on attack).
Projectiles: spit = small magenta blob; bossBolt = larger spinning diamond with white core.
Pickups: xp = diamond (big has ring), heart = heart, magnet = horseshoe, stardust = 8-point gold star.

## Readability rules
1. Enemy outline 2–4 px bright, body fill very dark — silhouettes read at 300+ on screen.
2. Telegraph = brighter glow + white flash/pulse; attack = distinct extra geometry (streaks, open mouth, spikes), never only color.
3. The orb has a white-hot core and the biggest glow; it grows with speed01 and gets a halo ring above 0.7.
4. Every ship skin keeps a white cockpit and a cyan nose dot, so the player is findable regardless of skin.
5. Glow = cached radial sprite blitted additively. No `shadowBlur` per entity.

## Skins (cosmetic only — no hitbox, size or contrast change)
Ship: default, neon, ember, void, gold (supporter shimmer). Orb (also tints tether): default, plasma, ice, molten, prism (supporter, rainbow spokes). Trails: none, spark, ribbon, pixel, rainbow (supporter). `pts` for trails are x,y pairs oldest → newest.

## FEEL rationale (`src/fx/feel.ts`)
Hit-stop is 0 for normal hits (300 enemies would freeze the game), 22 ms kills, 45 ms crits, 85 ms player hurt. Shake scales with stakes (boss death 18 px, slow decay). Hit flash 90 ms; damage numbers live 650 ms (crit 900 ms, larger).

## Performance
Measured in the preview (`?stress` → 400 enemies + 1000 particles + arena + ship + orb): ~1.5 ms/frame draw; gallery ~0.6 ms.
