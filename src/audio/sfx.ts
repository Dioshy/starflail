import { eng, tone, noise, mtof } from './engine';

export type SfxName = 'hit' | 'hitHeavy' | 'crit' | 'enemyDie' | 'playerHurt' | 'pickupXp' | 'pickupHeart' | 'levelUp' | 'upgradePick' | 'bossWarn' | 'bossHit' | 'bossDie' | 'reel' | 'uiClick' | 'uiHover' | 'victory' | 'defeat' | 'purchase' | 'stardust';
export interface PlayOpts { volume?: number; pitch?: number; pan?: number }

const VOICE_LIMIT = 6;
const voices = new Map<string, number[]>();

type Recipe = (d: AudioNode, t: number, p: number) => number; // returns duration (s)

const arp = (d: AudioNode, t: number, p: number, notes: number[], step: number, type: OscillatorType, vol: number, len = 0.2) => {
  notes.forEach((m, i) => tone(d, t + i * step, type, mtof(m) * p, mtof(m) * p, len, vol, { lp: 5000 }));
  return notes.length * step + len;
};

const R: Record<SfxName, Recipe> = {
  hit: (d, t, p) => { tone(d, t, 'triangle', 260 * p, 90 * p, 0.09, 0.5); noise(d, t, 0.05, 'highpass', 2500, 2500, 0.25); return 0.1; },
  hitHeavy: (d, t, p) => { tone(d, t, 'square', 130 * p, 38 * p, 0.2, 0.45, { lp: 900 }); noise(d, t, 0.16, 'lowpass', 1800, 200, 0.5); return 0.22; },
  crit: (d, t, p) => { tone(d, t, 'triangle', 300 * p, 100 * p, 0.1, 0.45); tone(d, t, 'sawtooth', 1200 * p, 2000 * p, 0.14, 0.18, { lp: 6000 }); noise(d, t, 0.07, 'highpass', 4000, 4000, 0.3); return 0.16; },
  enemyDie: (d, t, p) => { noise(d, t, 0.2, 'bandpass', 2400 * p, 300, 0.45, 2); tone(d, t, 'triangle', 320 * p, 60 * p, 0.16, 0.35); return 0.22; },
  playerHurt: (d, t, p) => { tone(d, t, 'sawtooth', 220 * p, 55 * p, 0.35, 0.5, { lp: 1200 }); noise(d, t, 0.25, 'lowpass', 2500, 150, 0.55); return 0.38; },
  pickupXp: (d, t, p) => { tone(d, t, 'sine', 820 * p, 1250 * p, 0.07, 0.3); return 0.08; },
  pickupHeart: (d, t, p) => arp(d, t, p, [76, 83], 0.07, 'sine', 0.35, 0.22),
  levelUp: (d, t, p) => arp(d, t, p, [69, 73, 76, 81, 85], 0.07, 'square', 0.18, 0.28),
  upgradePick: (d, t, p) => { arp(d, t, p, [72, 79], 0.06, 'triangle', 0.35, 0.2); noise(d, t + 0.1, 0.15, 'highpass', 6000, 9000, 0.12); return 0.35; },
  bossWarn: (d, t, p) => { for (let i = 0; i < 3; i++) tone(d, t + i * 0.42, 'sawtooth', 120 * p, 80 * p, 0.38, 0.4, { lp: 700, attack: 0.05 }); noise(d, t, 1.2, 'lowpass', 200, 900, 0.18); return 1.3; },
  bossHit: (d, t, p) => { tone(d, t, 'square', 110 * p, 40 * p, 0.25, 0.5, { lp: 800 }); tone(d, t, 'sine', 520 * p, 480 * p, 0.3, 0.25); noise(d, t, 0.12, 'bandpass', 1500, 600, 0.4, 3); return 0.32; },
  bossDie: (d, t, p) => { noise(d, t, 1.6, 'lowpass', 3000, 60, 0.7); tone(d, t, 'sawtooth', 220 * p, 30 * p, 1.5, 0.45, { lp: 1000 }); for (let i = 0; i < 5; i++) noise(d, t + i * 0.18, 0.2, 'bandpass', 1800, 300, 0.35, 2); return 1.7; },
  reel: (d, t, p) => { tone(d, t, 'sawtooth', 150 * p, 230 * p, 0.14, 0.14, { lp: 1400, attack: 0.03 }); return 0.16; },
  uiClick: (d, t, p) => { tone(d, t, 'square', 640 * p, 480 * p, 0.05, 0.25, { lp: 3000 }); return 0.06; },
  uiHover: (d, t, p) => { tone(d, t, 'sine', 900 * p, 980 * p, 0.03, 0.12); return 0.04; },
  victory: (d, t, p) => arp(d, t, p, [69, 73, 76, 81, 76, 81, 85, 88], 0.11, 'square', 0.2, 0.4),
  defeat: (d, t, p) => arp(d, t, p, [69, 66, 62, 57, 50], 0.18, 'sawtooth', 0.22, 0.5),
  purchase: (d, t, p) => { tone(d, t, 'square', 988 * p, 988 * p, 0.07, 0.22, { lp: 5000 }); tone(d, t + 0.07, 'square', 1319 * p, 1319 * p, 0.25, 0.22, { lp: 5000 }); return 0.35; },
  stardust: (d, t, p) => { tone(d, t, 'sine', 1500 * p, 2200 * p, 0.12, 0.25); tone(d, t + 0.04, 'sine', 2250 * p, 3300 * p, 0.14, 0.15); return 0.2; },
};

export const SFX_NAMES = Object.keys(R) as SfxName[];

export function playSfx(name: SfxName, o: PlayOpts = {}): void {
  const ctx = eng.ctx;
  if (!ctx || !eng.sfx || !R[name]) return;
  const now = ctx.currentTime;
  const list = (voices.get(name) ?? []).filter((e) => e > now);
  if (list.length >= VOICE_LIMIT) { voices.set(name, list); return; }
  const g = ctx.createGain();
  g.gain.value = Math.max(0, o.volume ?? 1);
  let dest: AudioNode = g;
  if (o.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(pn); pn.connect(eng.sfx); dest = g; } else g.connect(eng.sfx);
  const p = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * 0.06);
  const dur = R[name](dest, now + 0.001, p);
  list.push(now + dur);
  voices.set(name, list);
}
