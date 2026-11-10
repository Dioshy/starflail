import { describe, it, expect, vi } from 'vitest';
import { audio, SFX_NAMES } from './index';

describe('audio before unlock / in Node', () => {
  it('never creates an AudioContext before unlock and all calls are no-ops', () => {
    const ctor = vi.fn();
    (globalThis as any).AudioContext = ctor;
    for (const n of SFX_NAMES) expect(() => audio.play(n, { volume: 1, pitch: 1.2, pan: -0.5 })).not.toThrow();
    expect(() => { audio.music.start(); audio.music.setIntensity(0.7); audio.music.stinger('boss'); audio.music.stinger('victory'); audio.music.stinger('defeat'); audio.music.stop(); }).not.toThrow();
    audio.setVolume('master', 0.3); audio.setMuted(true); audio.setMuted(false);
    expect(ctor).not.toHaveBeenCalled();
    delete (globalThis as any).AudioContext;
  });
  it('unlock resolves in Node without an AudioContext', async () => {
    await expect(audio.unlock()).resolves.toBeUndefined();
  });
  it('volumes are stored and clamped', () => {
    audio.setVolume('sfx', 2); expect(audio.getVolume('sfx')).toBe(1);
    audio.setVolume('music', -1); expect(audio.getVolume('music')).toBe(0);
    audio.setVolume('master', 0.25); expect(audio.getVolume('master')).toBe(0.25);
  });
});
