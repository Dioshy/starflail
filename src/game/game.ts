import { Screen } from '../core/canvas';
import { Input, NO_INTENT, type Intents } from '../core/input';
import { FixedStepper, STEP } from '../core/loop';
import { drawDeath, drawDebug, drawHud, drawPause, drawTouch } from '../ui/hud';
import type { Params } from './params';
import { Renderer } from './render';
import { World } from './sim';

/** Scripted driver for ?auto=1 and ?skipTo: circles the ship and pulses reel so the orb swings. */
export function autopilot(t: number): Intents {
  const a = t * 0.07;
  return { moveX: Math.cos(a), moveY: Math.sin(a), reel: (t % 90) < 28, pause: false, confirm: true };
}

export class Game {
  readonly screen: Screen;
  readonly input: Input;
  readonly world: World;
  readonly renderer = new Renderer();
  private stepper = new FixedStepper();
  paused = false;
  private hitstop = 0; // ms
  private sinceHitstop = 1000;
  private last = 0;
  private fps = 60;
  private frameMs = 0;
  private simMs = 0;

  constructor(canvas: HTMLCanvasElement, readonly params: Params) {
    this.screen = new Screen(canvas);
    this.input = new Input(this.screen);
    this.world = new World({ seed: params.seed, god: params.god, stress: params.stress });
    this.renderer.debug = params.debug;
    if (params.skipTo > 0) this.skipTo(params.skipTo);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.paused = true; });
    if (params.debug) {
      (window as unknown as { __game: unknown }).__game = {
        world: this.world,
        pause: (v = true) => { this.paused = v; },
        step: (n = 1) => { for (let i = 0; i < n; i++) this.world.step(NO_INTENT); },
      };
    }
  }

  private skipTo(sec: number): void {
    const god = this.world.god;
    this.world.god = true;
    for (let t = 0; t < sec * 60; t++) this.world.step(autopilot(t));
    this.world.god = god;
    this.world.events.length = 0;
  }

  start(): void {
    requestAnimationFrame((t) => { this.last = t; requestAnimationFrame(this.frame); });
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const t0 = performance.now();
    const real = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (real > 0) this.fps += (1 / real - this.fps) * 0.05;
    const w = this.world, fx = w.T.fx;
    const intents = this.input.poll();
    if (intents.pause && !w.dead) this.paused = !this.paused;
    let alpha = this.stepper.acc / STEP;
    if (!this.paused) {
      this.sinceHitstop += real * 1000;
      if (this.hitstop > 0) this.hitstop -= real * 1000;
      else {
        const auto = this.params.auto;
        alpha = this.stepper.advance(real * this.params.speed, (i) => {
          const base = auto && !w.dead ? autopilot(w.tick) : intents;
          const it: Intents = i === 0 ? base : { ...base, confirm: false, pause: false };
          w.step(auto && w.dead ? { ...it, confirm: true } : it);
        });
        const evs = w.events;
        let stop = 0;
        for (const e of evs) {
          if (e.type === 'crit' || (e.type === 'kill' && e.kind === 'brute')) stop = Math.max(stop, fx.hitstopCritMs);
          else if (e.type === 'hit' && this.sinceHitstop > fx.hitstopMinGapMs) stop = Math.max(stop, fx.hitstopHitMs);
        }
        if (stop > 0 && this.sinceHitstop > fx.hitstopMinGapMs) { this.hitstop = stop; this.sinceHitstop = 0; }
        this.renderer.handleEvents(evs, w);
        evs.length = 0;
      }
    }
    this.simMs += (performance.now() - t0 - this.simMs) * 0.1;

    const s = this.screen, c = s.ctx;
    s.begin();
    this.renderer.draw(c, w, alpha, this.paused ? 0 : real);
    drawHud(c, w, now);
    drawTouch(c, this.input.touch);
    if (w.dead) drawDeath(c, w, this.input.touch.seen);
    if (this.paused) drawPause(c);
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;
    if (this.params.debug) {
      drawDebug(c, [
        `fps ${this.fps.toFixed(0)}  ms/frame ${this.frameMs.toFixed(2)} (sim+draw)`,
        `tick ${w.tick}  seed ${w.seed}  hash ${w.stateHash().toString(16)}`,
        `enemies ${w.enemies.count}  motes ${w.motes.count}  hits ${w.hitCount}`,
        `orb speed ${w.orbSpeed().toFixed(0)}  rest ${w.tether.rest.toFixed(0)}`,
        `god ${w.god}  speed x${this.params.speed}  stress ${this.params.stress}`,
      ]);
    }
  };
}
