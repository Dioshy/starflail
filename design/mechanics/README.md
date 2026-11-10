# Mechanics rule cards

Each card: purpose, inputs, state (with units and data source), ordered resolution, outputs, edge cases, given/when/then
tests, and a dominant-strategy review. Numbers live in `src/data/`; cards cite the field names, so a retune means
changing data, not prose (where a card quotes a number, the data file wins).

| Card | Covers |
|---|---|
| [tether-and-orb.md](tether-and-orb.md) | Spring tether, orb physics, arena wall |
| [reel.md](reel.md) | Reel in/hold/release, angular momentum |
| [damage-and-crit.md](damage-and-crit.md) | Hit formula, crit, armour, knockback, projectile swatting |
| [health.md](health.md) | HP, i-frames, regen, hearts, Second Wind |
| [xp.md](xp.md) | Motes, level curve |
| [upgrade-draft.md](upgrade-draft.md) | Draft eligibility, rarity roll, reroll, fallback, the 25 upgrades |
| [behaviors.md](behaviors.md) | The 8 behaviors |
| [enemies.md](enemies.md) | mite, dart, wisp, blob, blobling, spitter, brute |
| [bosses.md](bosses.md) | warden, hive, eclipse |
| [wave-director.md](wave-director.md) | Waves, events, spawn placement, overtime and endless scaling |
| [stardust.md](stardust.md) | Meta currency faucets and sinks |
| [meta-unlocks.md](meta-unlocks.md) | Ships, orbs, upgrade packs, cosmetics |
| [balance.md](balance.md) | Target calculations and assumptions |

## Tick order (fixed 60 Hz; one seeded RNG per stream: `spawn`, `draft`, `drops`, `ai`, `vfx`)

1. Read input intents (Move, Reel).
2. Reel phase and rest length (reel.md), including tangential scaling.
3. Ship steering, tether forces, drag, clamps, integration, hard rope, arena (tether-and-orb.md).
4. Enemy AI and telegraph timers, movement, separation, knockback decay (enemies.md, bosses.md).
5. Projectiles move; the orb swats projectiles.
6. **Orb hits → damage → behaviors → kills → drops/splits** (damage-and-crit.md, behaviors.md).
7. **Contact and projectile damage to the ship** (health.md). Step 6 runs before 7, so a killing blow on the same tick as the ship's death counts.
8. Pickups: attract, collect, XP, level-up queue (xp.md).
9. Wave director: spawns and events (wave-director.md).
10. If `pendingDrafts > 0` or the ship died: pause the sim and open the draft or death UI.
