import { describe, expect, it } from 'vitest';
import { NavGrid, type Pt, type Rect } from '../src/render/navigation';

const bounds: Rect = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
const wall: Rect = { minX: -1, maxX: 1, minZ: -3, maxZ: 3 }; // vật cản giữa phòng

function crosses(path: Pt[], from: Pt, rect: Rect): boolean {
  const pts = [from, ...path];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t;
      const z = pts[i]!.z + (pts[i + 1]!.z - pts[i]!.z) * t;
      if (x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ) return true;
    }
  }
  return false;
}

describe('NavGrid', () => {
  const nav = new NavGrid(bounds, [wall]);

  it('đường thẳng khi không có vật cản', () => {
    expect(nav.findPath({ x: -4, z: -4 }, { x: -4, z: 4 })).toEqual([{ x: -4, z: 4 }]);
  });
  it('đi vòng qua vật cản và kết thúc đúng đích', () => {
    const from = { x: -3, z: 0 };
    const to = { x: 3, z: 0 };
    const path = nav.findPath(from, to);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(to);
    expect(crosses(path, from, wall)).toBe(false);
  });
  it('xuất phát hoặc đích nằm trong vật cản vẫn trả về đường đi tới đích', () => {
    const path = nav.findPath({ x: 0, z: 0 }, { x: 3, z: 0 });
    expect(path.at(-1)).toEqual({ x: 3, z: 0 });
    const inside = nav.findPath({ x: -3, z: 0 }, { x: 0.2, z: 0 });
    expect(inside.at(-1)).toEqual({ x: 0.2, z: 0 });
  });
  it('bị bao kín hoàn toàn thì vẫn trả về đích (không treo)', () => {
    const closed = new NavGrid(bounds, [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }, { minX: -5, maxX: 5, minZ: 3, maxZ: 5 }], 0.25, 0.28);
    expect(closed.findPath({ x: 0, z: 0 }, { x: 0, z: 4 }).at(-1)).toEqual({ x: 0, z: 4 });
  });
});

describe('NavGrid đích bị chặn', () => {
  it('snapGoal dừng ở ô trống gần nhất thay vì đi xuyên vật cản', () => {
    const nav = new NavGrid(bounds, [wall]);
    const path = nav.findPath({ x: -3, z: 0 }, { x: 0, z: 0 }, true);
    const last = path.at(-1)!;
    expect(last.x > wall.minX - 0.28 && last.x < wall.maxX + 0.28 && last.z > wall.minZ - 0.28 && last.z < wall.maxZ + 0.28).toBe(false);
  });
});
