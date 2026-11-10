// Shared WebAudio state. Nothing here touches AudioContext until create() (called from unlock()).
export type Channel = 'master' | 'sfx' | 'music';

interface Engine {
  ctx: AudioContext | null;
  master: GainNode | null; sfx: GainNode | null; music: GainNode | null;
  noise: AudioBuffer | null;
  vol: Record<Channel, number>;
  muted: boolean;
}
export const eng: Engine = { ctx: null, master: null, sfx: null, music: null, noise: null, vol: { master: 0.8, sfx: 0.9, music: 0.5 }, muted: false };

export function applyVolumes(): void {
  if (!eng.ctx || !eng.master || !eng.sfx || !eng.music) return;
  const t = eng.ctx.currentTime;
  eng.master.gain.setTargetAtTime(eng.muted ? 0 : eng.vol.master, t, 0.02);
  eng.sfx.gain.setTargetAtTime(eng.vol.sfx, t, 0.02);
  eng.music.gain.setTargetAtTime(eng.vol.music * 0.6, t, 0.02);
}

/** Creates the context graph: sfx/music -> master -> compressor -> destination. */
export function create(): boolean {
  if (eng.ctx) return true;
  const AC: typeof AudioContext | undefined = typeof globalThis !== 'undefined' ? (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
  if (!AC) return false;
  const ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
  const master = ctx.createGain(), sfx = ctx.createGain(), music = ctx.createGain();
  sfx.connect(master); music.connect(master); master.connect(comp); comp.connect(ctx.destination);
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  eng.ctx = ctx; eng.master = master; eng.sfx = sfx; eng.music = music; eng.noise = buf;
  applyVolumes();
  return true;
}

export function mtof(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

export interface ToneOpts { attack?: number; lp?: number; sustain?: boolean; rel?: number; detune?: number }

/** Oscillator with envelope. f0 -> f1 exponential glide. */
export function tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, o: ToneOpts = {}): void {
  const ctx = eng.ctx!;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, f0), t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  if (o.sustain) g.gain.setValueAtTime(vol, t + Math.max(a, dur - (o.rel ?? 0.15)));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out: AudioNode = osc;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); out = f; }
  out.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + dur + 0.02);
}

export function noise(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1): void {
  const ctx = eng.ctx!;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = eng.noise; src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
