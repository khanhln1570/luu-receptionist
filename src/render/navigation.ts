// Lưới điều hướng 2D (mặt sàn, trục x–z) để khách đi vòng qua đồ nội thất. Thuần dữ liệu, không phụ thuộc Three.js.

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface Pt {
  x: number;
  z: number;
}

export class NavGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;

  /** `bounds` là vùng đi lại được, `obstacles` bị nới thêm `radius` (bán kính khách). */
  constructor(
    private readonly bounds: Rect,
    obstacles: readonly Rect[],
    private readonly cell = 0.25,
    radius = 0.28,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        if (obstacles.some((o) => p.x > o.minX - radius && p.x < o.maxX + radius && p.z > o.minZ - radius && p.z < o.maxZ + radius)) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  private center(c: number, r: number): Pt {
    return { x: this.bounds.minX + (c + 0.5) * this.cell, z: this.bounds.minZ + (r + 0.5) * this.cell };
  }

  private cellOf(p: Pt): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.bounds.minX) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.bounds.minZ) / this.cell)));
    return [c, r];
  }

  /** Một điểm đi được ngẫu nhiên trên toàn sảnh (rand trả số trong [0,1)). */
  randomPoint(rand: () => number): Pt {
    const free: Array<[number, number]> = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.isFree(c, r)) free.push([c, r]);
    const [c, r] = free[Math.floor(rand() * free.length)] ?? [0, 0];
    return this.center(c, r);
  }

  isFree(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c];
  }

  /** Ô đi được gần nhất (theo vòng tròn mở rộng dần). */
  private nearestFree(c0: number, r0: number): [number, number] | null {
    if (this.isFree(c0, r0)) return [c0, r0];
    for (let d = 1; d < Math.max(this.cols, this.rows); d++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let r = r0 - d; r <= r0 + d; r++) {
        for (let c = c0 - d; c <= c0 + d; c++) {
          if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== d || !this.isFree(c, r)) continue;
          const dd = (c - c0) ** 2 + (r - r0) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = [c, r];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Đường thẳng giữa hai điểm có đi xuyên ô bị chặn không. */
  private clear(a: Pt, b: Pt): boolean {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell / 2));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const [c, r] = this.cellOf({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      if (!this.isFree(c, r)) return false;
    }
    return true;
  }

  /** Danh sách điểm đi qua (không gồm điểm xuất phát, kết thúc đúng tại `to`). Điểm đầu/cuối nằm trong vật cản vẫn được nối thẳng. */
  findPath(from: Pt, to: Pt, snapGoal = false): Pt[] {
    const s = this.nearestFree(...this.cellOf(from));
    const g = this.nearestFree(...this.cellOf(to));
    if (!s || !g) return [to];
    const key = (c: number, r: number) => r * this.cols + c;
    const open = new Map<number, { c: number; r: number; g: number; f: number }>();
    const came = new Map<number, number>();
    const gScore = new Map<number, number>();
    const h = (c: number, r: number) => Math.hypot(c - g[0], r - g[1]);
    gScore.set(key(...s), 0);
    open.set(key(...s), { c: s[0], r: s[1], g: 0, f: h(...s) });
    const closed = new Set<number>();
    let found = false;
    while (open.size > 0) {
      let cur: { c: number; r: number; g: number; f: number } | undefined;
      for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
      const k = key(cur!.c, cur!.r);
      if (cur!.c === g[0] && cur!.r === g[1]) {
        found = true;
        break;
      }
      open.delete(k);
      closed.add(k);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const c = cur!.c + dc;
          const r = cur!.r + dr;
          if (!this.isFree(c, r) || closed.has(key(c, r))) continue;
          if (dc && dr && (!this.isFree(cur!.c + dc, cur!.r) || !this.isFree(cur!.c, cur!.r + dr))) continue; // không cắt góc
          const ng = cur!.g + Math.hypot(dc, dr);
          const nk = key(c, r);
          if (ng < (gScore.get(nk) ?? Infinity)) {
            gScore.set(nk, ng);
            came.set(nk, k);
            open.set(nk, { c, r, g: ng, f: ng + h(c, r) });
          }
        }
      }
    }
    if (!found) return [to];
    const cells: Pt[] = [];
    for (let k: number | undefined = key(...g); k !== undefined; k = came.get(k)) {
      cells.push(this.center(k % this.cols, Math.floor(k / this.cols)));
    }
    cells.reverse();
    const end = snapGoal && !this.isFree(...this.cellOf(to)) ? cells.at(-1)! : to; // đích bị chặn: dừng ở ô trống gần nhất
    const pts = [from, ...cells.slice(1, -1), end];
    // Làm thẳng đường: bỏ điểm trung gian nếu nối thẳng vẫn không chạm vật cản
    const out: Pt[] = [];
    let anchor = pts[0]!;
    for (let i = 1; i < pts.length; i++) {
      const next = pts[i + 1];
      if (next && this.clear(anchor, next)) continue;
      out.push(pts[i]!);
      anchor = pts[i]!;
    }
    return out;
  }
}
