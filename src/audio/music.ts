import { eng, tone, noise, mtof } from './engine';

const BPM = 124, STEP = 60 / BPM / 4, LOOKAHEAD = 0.15;
// A minor: i - VI - III - VII  (Am F C G)
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const LEAD: number[][] = [
  [81, -1, -1, 84, -1, 88, -1, -1, 86, -1, 84, -1, 81, -1, -1, -1],
  [81, -1, -1, 84, -1, 89, -1, -1, 88, -1, 84, -1, 81, -1, 77, -1],
  [79, -1, -1, 84, -1, 88, -1, -1, 91, -1, 88, -1, 84, -1, -1, -1],
  [79, -1, 83, -1, 86, -1, 83, -1, 79, -1, 74, -1, 79, -1, -1, -1],
];

let timer: ReturnType<typeof setInterval> | null = null;
let wanted = false;
let nextTime = 0, step = 0, intensity = 0;
let layers: { pad: GainNode; bass: GainNode; drums: GainNode; arp: GainNode; lead: GainNode } | null = null;
const smooth = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

function applyLayers(): void {
  if (!layers || !eng.ctx) return;
  const t = eng.ctx.currentTime;
  layers.pad.gain.setTargetAtTime(1 - 0.35 * smooth(0.5, 1, intensity), t, 0.3);
  layers.bass.gain.setTargetAtTime(1, t, 0.3);
  layers.drums.gain.setTargetAtTime(smooth(0.3, 0.55, intensity), t, 0.25);
  layers.arp.gain.setTargetAtTime(smooth(0.35, 0.6, intensity), t, 0.25);
  layers.lead.gain.setTargetAtTime(smooth(0.8, 0.95, intensity), t, 0.25);
}

function schedule(s: number, t: number): void {
  const L = layers!;
  const sb = s % 16, bar = Math.floor(s / 16) % 4, chord = CHORDS[bar];
  if (sb === 0) for (const m of chord) for (const dt of [-6, 6]) tone(L.pad, t, 'sawtooth', mtof(m), mtof(m), STEP * 16, 0.05, { lp: 900, attack: 0.4, sustain: true, rel: 0.5, detune: dt });
  if (sb % 2 === 0) {
    const root = BASS[bar] + (sb === 6 || sb === 14 ? 12 : 0);
    tone(L.bass, t, 'sawtooth', mtof(root), mtof(root), STEP * 1.8, sb % 4 === 0 ? 0.2 : 0.13, { lp: 320 });
  }
  if (intensity >= 0.25) {
    if (sb % 4 === 0) tone(L.drums, t, 'sine', 150, 42, 0.2, 0.7);
    if (sb % 8 === 4) { noise(L.drums, t, 0.14, 'bandpass', 1900, 1500, 0.35, 0.8); tone(L.drums, t, 'triangle', 220, 140, 0.1, 0.2); }
    if (sb % 2 === 1 || intensity > 0.75) noise(L.drums, t, 0.035, 'highpass', 7500, 7500, sb % 4 === 2 ? 0.16 : 0.09);
  }
  if (intensity >= 0.3) {
    const m = chord[[0, 1, 2, 1][s % 4]] + 12 + (sb >= 8 ? 12 * 0 : 0);
    tone(L.arp, t, 'square', mtof(m), mtof(m), STEP * 0.9, 0.055, { lp: 3200 });
  }
  if (intensity >= 0.75) {
    const m = LEAD[bar][sb];
    if (m >= 0) { tone(L.lead, t, 'sawtooth', mtof(m), mtof(m), STEP * 3, 0.1, { lp: 4200, attack: 0.01 }); tone(L.lead, t, 'square', mtof(m - 12), mtof(m - 12), STEP * 3, 0.06, { lp: 1500 }); }
  }
}

function tick(): void {
  const ctx = eng.ctx;
  if (!ctx || !layers) return;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + LOOKAHEAD) { schedule(step, nextTime); nextTime += STEP; step = (step + 1) % 64; }
}

export const music = {
  start(): void {
    wanted = true;
    const ctx = eng.ctx;
    if (!ctx || !eng.music || timer) return;
    layers = { pad: ctx.createGain(), bass: ctx.createGain(), drums: ctx.createGain(), arp: ctx.createGain(), lead: ctx.createGain() };
    for (const g of Object.values(layers)) g.connect(eng.music);
    nextTime = ctx.currentTime + 0.1; step = 0;
    applyLayers();
    timer = setInterval(tick, 25);
  },
  stop(): void {
    wanted = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (layers && eng.ctx) {
      const t = eng.ctx.currentTime, old = layers;
      for (const g of Object.values(old)) g.gain.setTargetAtTime(0, t, 0.12);
      setTimeout(() => { for (const g of Object.values(old)) g.disconnect(); }, 800);
    }
    layers = null;
  },
  setIntensity(x: number): void { intensity = Math.max(0, Math.min(1, x)); applyLayers(); },
  stinger(kind: 'boss' | 'victory' | 'defeat'): void {
    const ctx = eng.ctx;
    if (!ctx || !eng.sfx) return;
    const t = ctx.currentTime + 0.01, d = eng.sfx;
    if (kind === 'boss') {
      noise(d, t, 1.4, 'lowpass', 200, 2500, 0.3);
      for (const m of [33, 45, 52]) tone(d, t + 0.9, 'sawtooth', mtof(m), mtof(m) * 0.9, 1.4, 0.22, { lp: 900 });
      noise(d, t + 0.9, 0.5, 'lowpass', 2000, 100, 0.6);
    } else if (kind === 'victory') {
      [[69, 73, 76], [72, 76, 79], [74, 78, 81], [81, 85, 88]].forEach((c, i) => c.forEach((m) => tone(d, t + i * 0.16, 'square', mtof(m), mtof(m), i === 3 ? 1.4 : 0.3, 0.1, { lp: 4500 })));
    } else {
      [[57, 60, 64], [55, 58, 62], [53, 56, 60], [45, 48, 52]].forEach((c, i) => c.forEach((m) => tone(d, t + i * 0.28, 'sawtooth', mtof(m), mtof(m) * 0.98, i === 3 ? 1.8 : 0.4, 0.09, { lp: 1200 })));
    }
  },
  /** called by unlock() so music requested before the gesture starts afterwards */
  resumeIfWanted(): void { if (wanted) this.start(); },
};
