/**
 * Uniform-grid spatial hash for circles. Zero allocation after construction
 * (apart from growth). Items are identified by the index returned by insert().
 */
export class SpatialHash {
  private readonly dim: number;
  private readonly head: Int32Array;
  private entNext: Int32Array;
  private entItem: Int32Array;
  private entCount = 0;
  private stamps: Int32Array;
  private stamp = 0;
  x: Float64Array;
  y: Float64Array;
  r: Float64Array;
  count = 0;

  /** half = half extent of the world; positions outside are clamped to edge cells. */
  constructor(
    readonly cellSize: number,
    readonly half: number,
    capacity = 512,
  ) {
    this.dim = Math.max(1, Math.ceil((half * 2) / cellSize));
    this.head = new Int32Array(this.dim * this.dim).fill(-1);
    this.entNext = new Int32Array(capacity * 4);
    this.entItem = new Int32Array(capacity * 4);
    this.stamps = new Int32Array(capacity);
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.r = new Float64Array(capacity);
  }

  clear(): void {
    this.head.fill(-1);
    this.entCount = 0;
    this.count = 0;
  }

  private cell(v: number): number {
    const c = Math.floor((v + this.half) / this.cellSize);
    return c < 0 ? 0 : c >= this.dim ? this.dim - 1 : c;
  }

  private grow(): void {
    const n = this.x.length * 2;
    const g = <T extends Float64Array | Int32Array>(a: T, size: number): T => {
      const b = new (a.constructor as new (n: number) => T)(size);
      b.set(a);
      return b;
    };
    this.x = g(this.x, n);
    this.y = g(this.y, n);
    this.r = g(this.r, n);
    this.stamps = g(this.stamps, n);
  }

  insert(x: number, y: number, r: number): number {
    if (this.count >= this.x.length) this.grow();
    const id = this.count++;
    this.x[id] = x;
    this.y[id] = y;
    this.r[id] = r;
    const x0 = this.cell(x - r), x1 = this.cell(x + r);
    const y0 = this.cell(y - r), y1 = this.cell(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.entCount >= this.entItem.length) {
          const n = this.entItem.length * 2;
          const ni = new Int32Array(n); ni.set(this.entItem); this.entItem = ni;
          const nn = new Int32Array(n); nn.set(this.entNext); this.entNext = nn;
        }
        const c = cy * this.dim + cx;
        const e = this.entCount++;
        this.entItem[e] = id;
        this.entNext[e] = this.head[c];
        this.head[c] = e;
      }
    }
    return id;
  }

  /** Appends ids of items whose circle overlaps the query circle to out (cleared first). */
  query(x: number, y: number, r: number, out: number[]): number {
    out.length = 0;
    if (++this.stamp >= 0x7fffffff) { this.stamps.fill(0); this.stamp = 1; }
    const st = this.stamp;
    const x0 = this.cell(x - r), x1 = this.cell(x + r);
    const y0 = this.cell(y - r), y1 = this.cell(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let e = this.head[cy * this.dim + cx]; e !== -1; e = this.entNext[e]) {
          const id = this.entItem[e];
          if (this.stamps[id] === st) continue;
          this.stamps[id] = st;
          const dx = this.x[id] - x, dy = this.y[id] - y, rr = this.r[id] + r;
          if (dx * dx + dy * dy <= rr * rr) out.push(id);
        }
      }
    }
    return out.length;
  }
}
