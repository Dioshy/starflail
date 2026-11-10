export const STEP = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

/** Fixed-step accumulator with a clamp on steps per frame. */
export class FixedStepper {
  acc = 0;
  constructor(
    readonly step = STEP,
    readonly maxSteps = MAX_STEPS_PER_FRAME,
  ) {}

  /** Runs fn for each due step; returns the render interpolation alpha in [0,1). */
  advance(frameDt: number, fn: (stepIndex: number) => void): number {
    this.acc += frameDt;
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      fn(n++);
      this.acc -= this.step;
    }
    if (this.acc >= this.step) this.acc = this.acc % this.step; // drop the backlog instead of spiralling
    return this.acc / this.step;
  }
}
