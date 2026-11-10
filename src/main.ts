import { Game } from './game/game';
import { parseParams } from './game/params';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas missing');
const game = new Game(canvas, parseParams(location.search));
canvas.focus();
game.start();
