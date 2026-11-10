# STARFLAIL — Audio

100% WebAudio synthesis (`src/audio/`). No AudioContext before `audio.unlock()` (call from first user gesture). Every call is a no-op before unlock and in Node. Graph: sfx/music → master → DynamicsCompressor (-14 dB, 6:1) → out. Voice limit 6 per sfx name. Pitch jitter ±6%; `opts.pitch` multiplies (use rising pitch for combo hits).

## SFX
| Name | Sound | Trigger |
|---|---|---|
| hit | short triangle thump + tick | orb hits enemy |
| hitHeavy | square sub drop + noise | high-speed/heavy hit |
| crit | thump + high saw ping | crit |
| enemyDie | bandpass noise sweep + tri drop | enemy dies |
| playerHurt | saw drop + noise | player damaged |
| pickupXp | tiny rising blip | xp pickup |
| pickupHeart | 2-note sine arp | heart |
| levelUp | 5-note rising square arp | level up |
| upgradePick | 2-note + sparkle | choose upgrade |
| bossWarn | 3 low siren pulses + riser | boss spawns |
| bossHit / bossDie | metallic thud / long explosion | boss hit / death |
| reel | soft rising saw whirr | while REEL held (rate-limit ~8/s) |
| uiClick / uiHover | click / faint tick | UI |
| victory / defeat | rising / falling arp | run end |
| purchase | two-tone coin | IAP success |
| stardust | glassy tinkle | stardust pickup |

## Music
A minor, 124 BPM, Am–F–C–G, lookahead scheduler (25 ms tick, 150 ms ahead). Layers (gain-faded by `setIntensity`):
- 0: detuned saw pad + saw bass
- ≥0.3–0.55: kick, snare, hats, square arp
- ≥0.8–0.95: boss lead (saw + sub-square)
Stingers: `boss` (riser + low chord hit), `victory` (major chord stabs), `defeat` (falling minor).
`music.start()` before unlock is remembered and begins on unlock.

## Mix (pre-master)
Music bus = volume×0.6 (default 0.3). Default volumes master 0.8, sfx 0.9, music 0.5. Kick 0.7 > snare 0.35 > bass 0.2 > pad 0.05 per voice; sfx sit above music.
