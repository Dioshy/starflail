export interface Params {
  seed: number;
  seedGiven: boolean;
  debug: boolean;
  god: boolean;
  skipTo: number;
  speed: number;
  stress: number;
  auto: boolean;
  /** start on a menu screen instead of the title (dev/testing) */
  screen: '' | 'title' | 'hangar' | 'results';
  /** dev only: add stardust to the save */
  give: number;
  /** any of seed/skipTo/stress/auto/debug/god given: skip the title and start a run immediately */
  direct: boolean;
}

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const num = (k: string, d: number): number => {
    const v = q.get(k);
    const n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const flag = (k: string): boolean => { const v = q.get(k); return v !== null && v !== '0' && v !== 'false'; };
  const screen = q.get('screen');
  const p: Params = {
    seed: num('seed', (Date.now() ^ 0x9e3779b9) >>> 0) >>> 0,
    seedGiven: q.has('seed'),
    debug: flag('debug'),
    god: flag('god'),
    skipTo: Math.max(0, num('skipTo', 0)),
    speed: Math.min(8, Math.max(0.1, num('speed', 1))),
    stress: Math.min(500, Math.max(0, Math.floor(num('stress', 0)))),
    auto: flag('auto'),
    screen: screen === 'title' || screen === 'hangar' || screen === 'results' ? screen : '',
    give: Math.max(0, Math.floor(num('give', 0))),
    direct: false,
  };
  p.direct = p.seedGiven || p.debug || p.god || p.skipTo > 0 || p.stress > 0 || p.auto;
  return p;
}
