/**
 * Fixed-capacity object pool. Active items live in items[0..count).
 * release() swap-removes, so iterate backwards when releasing while looping.
 */
export class Pool<T> {
  readonly items: T[] = [];
  count = 0;
  constructor(
    readonly capacity: number,
    factory: () => T,
  ) {
    for (let i = 0; i < capacity; i++) this.items.push(factory());
  }
  /** Returns a recycled item (caller must reinitialise it) or null when full. */
  acquire(): T | null {
    return this.count < this.capacity ? this.items[this.count++] : null;
  }
  release(index: number): void {
    const last = --this.count;
    const tmp = this.items[index];
    this.items[index] = this.items[last];
    this.items[last] = tmp;
  }
  clear(): void {
    this.count = 0;
  }
}
