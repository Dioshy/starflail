import { validateData } from './data/validate';
import { Game } from './game/game';
import { parseParams } from './game/params';

function fail(msg: string): never {
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;margin:0;padding:24px;background:#300;color:#ffb3b3;font:14px ui-monospace,monospace;white-space:pre-wrap;overflow:auto';
  d.textContent = msg;
  document.body.appendChild(d);
  throw new Error(msg);
}

// Dev startup: a broken data file must fail loudly, never silently produce a weird game.
if (import.meta.env.DEV) {
  const errors = validateData();
  if (errors.length) fail(`STARFLAIL data validation failed (${errors.length}):\n\n${errors.map((e) => ' - ' + e).join('\n')}`);
}

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas missing');
const game = new Game(canvas, parseParams(location.search));
canvas.focus();
game.start();
