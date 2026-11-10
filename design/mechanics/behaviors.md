# Rule card: Behaviors (the 8 special effects)

Purpose: give upgrades and orbs effects that change *how* you swing, not just numbers (P1, discovery). Exactly 8
behaviors exist; required params are enforced by `BEHAVIOR_PARAMS` in `src/data/upgrades.ts` and `validateData()`.

**Global rules**
- A behavior is on or off: every behavior upgrade has maxStacks 1, and a behavior already active from any source can't be drafted again.
- **Secondary damage** (everything below) never crits, never triggers another behavior (no recursion), and is rounded to an integer.
- **Flat damage scales with the wave**: `damage` params (thorns, shockwaveOnReel) are multiplied by the current wave's `hpMul` (1.0 → 3.2) so they stay relevant. Percentage params (damagePct) already scale with the build.
- Trigger order inside one tick: orb hit → chainOnCrit → orbExplodeOnCrit → kill handling (vampiric count, drops).

| Behavior | Trigger | Resolution | Params (current upgrade) | Feedback |
|---|---|---|---|---|
| `chainOnCrit` | Orb crit on an enemy | Jump to the nearest not-yet-chained enemy within `range` of the last target, up to `jumps` times. Each jump deals `damagePct` × the crit's damage. | jumps 3, range 160, damagePct 0.5 (Arc Coil) | Cyan lightning line, 80 ms |
| `tetherDamage` | Tether line segment (ship→orb, 4 px thick) overlaps an enemy | Deal `damagePct` × the non-crit orb damage at the current orb speed (0 if below minDamageSpeed). Per-enemy cooldown `hitCooldownSec`. | damagePct 0.25, hitCooldownSec 0.4 (Barbed Line) | Tether gets barbs; red tick sparks |
| `shockwaveOnReel` | `reelStart` event, if the cooldown is ready | Ring of radius `radius` centred on each orb: `damage × hpMul` to each enemy inside, plus outward knockback of `knockback` px/s × (1 - resist). | radius 130, damage 25, knockback 380, cooldownSec 1 (Reel Shock) | Expanding ring 0.25 s, bass thump |
| `orbExplodeOnCrit` | Orb crit, if the cooldown is ready | Explosion at the hit point: `damagePct` × the crit's damage to all other enemies within `radius`. | radius 110, damagePct 0.6, cooldownSec 0.5 (Nova Core) | Flash + 6 px shake |
| `thorns` | Enemy body touches the ship (even during i-frames) | `damage × hpMul` to that enemy and knockback `knockback` px/s away from the ship. Per-enemy cooldown `cooldownSec`. You still take the contact damage if not in i-frames. | damage 30, knockback 420, cooldownSec 0.5 (Static Hull) | Blue zap arc |
| `vampiric` | Any kill (orb or secondary) | `killCounter += 1`; at `killsPerHeal` → heal 1 if below max HP (the counter resets either way). At most `maxHealsPerMin` heals per rolling 60 s; extra triggers are discarded. | killsPerHeal 40, maxHealsPerMin 2 (Leech Orb) | Green mote flies from the kill to the ship |
| `magnetPulse` | Every `intervalSec` (run time, paused in drafts) | All XP motes within `radius` start homing (like the magnet pickup, but limited to the radius). | intervalSec 15, radius 700 (Tractor Pulse) | Soft radial ping |
| `slowField` | Continuous; if `onlyWhileReeling` = 1, only in reel phases `reeling`/`held` | Enemies (not bosses) within `radius` of any orb have their move speed × (1 − `slowPct`). Doesn't stack with itself. | radius 150, slowPct 0.4, onlyWhileReeling 1 (Gravity Reel) | Purple distortion disc around the orb |

## Edge cases

| Case | Rule |
|---|---|
| chainOnCrit with no enemy in range | Chain stops early; nothing is wasted or stored. |
| A chain or explosion kills a blob | The blob splits normally; children get 0.2 s invulnerability (so the same explosion can't hit them). |
| shockwaveOnReel with 2-3 orbs | One ring per orb, sharing **one** cooldown (all fire together). |
| thorns against a boss | Applies damage; knockback is scaled by the boss's 0.95+ resist (about nothing). |
| vampiric at full HP | The counter resets without healing (it does not bank). |
| slowField on bosses | No effect (bosses are immune to slow). Documented in the tooltip. |
| magnetPulse with hearts | Hearts are not affected (only XP motes). |

## Tests (given / when / then)

1. Given Arc Coil and a 144-damage crit with 4 mites in a line 100 px apart, then 3 more mites take 72 each.
2. Given Barbed Line, orb at 600 px/s (base stats), when the tether crosses a mite, then the mite takes round(0.25 × 48) = 12; it isn't hit again within 0.4 s.
3. Given Reel Shock at wave hpMul 1.6, when a reel starts, then enemies within 130 px of the orb take 40; a second reel within 1 s does nothing.
4. Given Nova Core, two crits 0.3 s apart, then only the first explodes.
5. Given Leech Orb at 3/5 HP, when 120 kills happen within 60 s, then exactly 2 heals happen.
6. Given Static Hull and a mite touching the ship during i-frames, then the mite takes 30 × hpMul and the ship takes 0.
7. Given Gravity Reel, not reeling, then enemies near the orb move at full speed; while held, at 60%.
8. Given an Arc Coil chain that crits nothing, then no orbExplodeOnCrit triggers from chain jumps (no recursion).

## Dominant-strategy review

- **Arc Coil + Nova Core** (crit AoE): both scale off crits, and both are capped by cooldown or jump count, so no infinite chains are possible (no recursion). Strong but needs a crit-speed build. Intended "storm" fantasy.
- **Static Hull + Bulwark** (bodyblock build): you still take contact damage, so it isn't a safe AFK strategy.
- **Gravity Reel + permanent hold**: the slow only matters while reeling, and holding the reel kills orb speed (reel.md), so it can't be a free crowd freeze.
