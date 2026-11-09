/** Bộ sinh số ngẫu nhiên có seed (mulberry32): cùng seed cho cùng kết quả. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Số thực trong [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Số nguyên trong [min, max], gồm cả hai đầu. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: mảng rỗng');
    return items[this.int(0, items.length - 1)]!;
  }

  /** Chọn theo trọng số, ví dụ [['a', 3], ['b', 1]]. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r < 0) return item;
    }
    return entries[entries.length - 1]![0];
  }
}
