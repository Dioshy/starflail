import type { DirectorDef, EventDef, WaveDef } from './types';

// Rule card: design/mechanics/wave-director.md
// Sawtooth pacing: ramp -> boss (breather wave) -> higher ramp. Waves are contiguous [fromSec, toSec).

export const WAVES: WaveDef[] = [
  { fromSec: 0, toSec: 30, spawnPerSec: 0.8, maxAlive: 20, hpMul: 1.0,
    mix: [{ enemy: 'mite', weight: 1 }], note: 'Teach: swing the orb into chasers.' },
  { fromSec: 30, toSec: 60, spawnPerSec: 1.2, maxAlive: 30, hpMul: 1.0,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'dart', weight: 1 }], note: 'Teach: dodge a telegraphed dash.' },
  { fromSec: 60, toSec: 120, spawnPerSec: 1.6, maxAlive: 40, hpMul: 1.1,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'dart', weight: 1 }, { enemy: 'wisp', weight: 1 }],
    note: 'Teach: orbiters; chase them down or catch the lunge with your swing.' },
  { fromSec: 120, toSec: 180, spawnPerSec: 2.0, maxAlive: 50, hpMul: 1.25,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'dart', weight: 2 }, { enemy: 'wisp', weight: 1 }, { enemy: 'blob', weight: 1 }],
    note: 'Teach: splitters. First tension peak before the Warden.' },
  { fromSec: 180, toSec: 240, spawnPerSec: 1.5, maxAlive: 35, hpMul: 1.35,
    mix: [{ enemy: 'mite', weight: 2 }, { enemy: 'blob', weight: 1 }], note: 'Warden fight: light adds only.' },
  { fromSec: 240, toSec: 300, spawnPerSec: 2.4, maxAlive: 60, hpMul: 1.6,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'dart', weight: 2 }, { enemy: 'wisp', weight: 2 }, { enemy: 'blob', weight: 1 }, { enemy: 'spitter', weight: 1 }],
    note: 'Teach: ranged enemies; orb swats spit.' },
  { fromSec: 300, toSec: 360, spawnPerSec: 2.8, maxAlive: 70, hpMul: 1.85,
    mix: [{ enemy: 'mite', weight: 2 }, { enemy: 'dart', weight: 2 }, { enemy: 'wisp', weight: 2 }, { enemy: 'blob', weight: 2 }, { enemy: 'spitter', weight: 1 }, { enemy: 'brute', weight: 0.5 }],
    note: 'Teach: armour needs reel speed. Second peak.' },
  { fromSec: 360, toSec: 420, spawnPerSec: 2.0, maxAlive: 45, hpMul: 2.1,
    mix: [{ enemy: 'mite', weight: 2 }, { enemy: 'blob', weight: 1 }, { enemy: 'spitter', weight: 1 }], note: 'Hive fight: light adds.' },
  { fromSec: 420, toSec: 480, spawnPerSec: 3.2, maxAlive: 80, hpMul: 2.4,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'dart', weight: 2 }, { enemy: 'wisp', weight: 2 }, { enemy: 'blob', weight: 2 }, { enemy: 'spitter', weight: 2 }, { enemy: 'brute', weight: 1 }],
    note: 'Test: everything at once.' },
  { fromSec: 480, toSec: 540, spawnPerSec: 3.6, maxAlive: 90, hpMul: 2.8,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'dart', weight: 2 }, { enemy: 'wisp', weight: 3 }, { enemy: 'blob', weight: 2 }, { enemy: 'spitter', weight: 2 }, { enemy: 'brute', weight: 1.5 }],
    note: 'Final peak before Eclipse.' },
  { fromSec: 540, toSec: 600, spawnPerSec: 2.0, maxAlive: 50, hpMul: 3.2,
    mix: [{ enemy: 'mite', weight: 3 }, { enemy: 'wisp', weight: 1 }, { enemy: 'spitter', weight: 1 }],
    note: 'Eclipse fight. After 600 s this wave repeats with overtime scaling until Eclipse or the player dies.' },
];

export const EVENTS: EventDef[] = [
  { atSec: 90, type: 'swarmRing', enemy: 'mite', count: 16 },
  { atSec: 150, type: 'rush', enemy: 'dart', count: 10 },
  { atSec: 180, type: 'boss', enemy: 'warden', count: 1 },
  { atSec: 270, type: 'swarmRing', enemy: 'blob', count: 8 },
  { atSec: 330, type: 'rush', enemy: 'wisp', count: 14 },
  { atSec: 360, type: 'boss', enemy: 'hive', count: 1 },
  { atSec: 450, type: 'swarmRing', enemy: 'mite', count: 30 },
  { atSec: 500, type: 'rush', enemy: 'brute', count: 4 },
  { atSec: 540, type: 'boss', enemy: 'eclipse', count: 1 },
];

export const DIRECTOR: DirectorDef = {
  spawnDistance: 760, // px from ship: just outside the 1280x720 view (half-diagonal 734)
  spawnTries: 8, // random angles tried before falling back to the nearest in-arena point
  ringRadius: 520, // swarmRing radius around the ship
  rushSpreadDeg: 30, // rush enemies enter from one direction within +-15 deg
  rushDurationSec: 3, // rush count is spread evenly over this time
  hardEnemyCap: 220, // events may exceed maxAlive but never this
  bossWarningSec: 2, // banner + edge arrow before a boss appears
  bossLeaveAfterSec: 120, // an unkilled warden/hive warps out (no reward); eclipse never leaves
  overtimeHpMulPer30s: 0.15, // after 600 s: hpMul += 0.15 every 30 s
  overtimeSpawnMulPer30s: 0.1, // after 600 s: spawnPerSec *= 1 + 0.1 every 30 s (cap maxAlive unchanged)
  edgeZoneRadius: 1150, // beyond this (arena 1600) the director heats up: wall-hugging kiting is punished
  edgeHeatSec: 8,
  edgeCoolSec: 4,
  edgeSpawnDistance: 320,
  edgeSpawnMul: 2.5,
};
