# STARFLAIL

2D top-down neon arcade roguelite for the browser. Your ship drags a heavy glowing orb on an elastic tether and never shoots: **orb speed is the damage**. Hold REEL to shorten the tether and spin the orb faster. This repo currently holds the core engine and a greybox swing-combat prototype.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview
npm test           # vitest (src/**/*.test.ts, tests/**/*.test.ts)
npm run typecheck
```

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Floating joystick (left half) |
| Reel | Space / Shift / right mouse | A (or triggers/bumper) | REEL button (right half) |
| Pause | Esc / P | Start | - |
| Confirm / new run | Enter / Space / click | A | Tap |

The speed meter (bottom left) marks where damage starts and where crits start. The orb changes colour: blue (harmless), cyan (damaging), orange (crit).

## Debug URL parameters

| Param | Effect |
|---|---|
| `?seed=N` | Fixed RNG seed (default: time-based) |
| `?debug=1` | Overlay with fps, ms/frame, entity counts, hitboxes; exposes `window.__game = { world, pause(v), step(n) }` |
| `?god=1` | Ship cannot be hurt |
| `?skipTo=SEC` | Fast-forward the sim SEC seconds with an autopilot (god while skipping) |
| `?speed=N` | Time scale (0.1-8) |
| `?stress=N` | Keep N enemies alive (up to 500) |
| `?auto=1` | Autopilot drives the ship (for screenshots / soak runs) |

## Layout

- `src/core/` engine primitives: fixed-step loop, seeded RNG, canvas letterboxing, input, spatial hash, pools.
- `src/game/sim.ts` DOM-free simulation (`World.step(intents)`, `stateHash()`), `tuning.ts` (all placeholder numbers), `render.ts` (all drawing), `game.ts` (loop glue, hitstop).
- `src/ui/hud.ts` canvas HUD, death/pause screens, touch controls.
- `tests/` determinism, tether, kinematic reel (3x+ spin), reel skill (pulse beats hold), damage, cooldown, spatial hash.

The sim never uses `Math.random` or wall-clock time; cosmetics use a separate RNG stream.
