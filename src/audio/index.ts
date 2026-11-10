import { eng, create, applyVolumes, type Channel } from './engine';
import { playSfx, type SfxName, type PlayOpts } from './sfx';
import { music } from './music';

export type { SfxName };
export { SFX_NAMES } from './sfx';

/** Every method is a safe no-op until unlock() has created the AudioContext (and always in Node). */
export const audio = {
  async unlock(): Promise<void> {
    try {
      if (!create()) return;
      if (eng.ctx && eng.ctx.state === 'suspended') await eng.ctx.resume();
      music.resumeIfWanted();
    } catch { /* autoplay blocked: stay silent */ }
  },
  play(name: SfxName, opts?: PlayOpts): void { try { playSfx(name, opts); } catch { /* never break gameplay for audio */ } },
  music: {
    start: () => music.start(),
    stop: () => music.stop(),
    setIntensity: (x01: number) => music.setIntensity(x01),
    stinger: (k: 'boss' | 'victory' | 'defeat') => music.stinger(k),
  },
  setVolume(ch: Channel, v01: number): void { eng.vol[ch] = Math.max(0, Math.min(1, v01)); applyVolumes(); },
  getVolume(ch: Channel): number { return eng.vol[ch]; },
  setMuted(b: boolean): void { eng.muted = b; applyVolumes(); },
};
