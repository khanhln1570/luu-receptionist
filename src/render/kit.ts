import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Khối dựng theo phong cách KayKit cho các món không có trong pack: cạnh bo tròn,
 * màu phẳng mờ (không bóng kim loại), cây lá low-poly đổ bóng phẳng. Dùng chung để sảnh đồng bộ với model của pack.
 */

export const KIT = {
  wood: 0xa4683f,
  woodDark: 0x6e4429,
  terracotta: 0xd0784c,
  terracottaDark: 0xa95a37,
  leaf: 0x5fae4e,
  leafDark: 0x3f8b45,
  metal: 0x34353d,
  gold: 0xe6b54a,
  glow: 0xffd27a,
  glass: 0xbfe3f2,
} as const;

const cache = new Map<string, MeshStandardMaterial>();

/** Vật liệu mờ dùng chung theo màu (flat = đổ bóng phẳng cho khối low-poly). */
export function mat(color: number, opts: { flat?: boolean; glow?: number; glowIntensity?: number; opacity?: number } = {}): MeshStandardMaterial {
  const key = `${color}|${opts.flat ?? false}|${opts.glow ?? ''}|${opts.glowIntensity ?? ''}|${opts.opacity ?? ''}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: opts.flat ?? false });
    if (opts.glow !== undefined) {
      m.emissive.set(opts.glow);
      m.emissiveIntensity = opts.glowIntensity ?? 1;
    }
    if (opts.opacity !== undefined) {
      m.transparent = true;
      m.opacity = opts.opacity;
    }
    cache.set(key, m);
  }
  return m;
}

function place<T extends Mesh>(m: T, x: number, y: number, z: number): T {
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Hộp bo cạnh; bán kính bo theo cạnh mỏng nhất để khối mỏng vẫn tròn trịa. */
export function rbox(w: number, h: number, d: number, color: number | MeshStandardMaterial, x = 0, y = 0, z = 0): Mesh {
  const r = Math.min(0.06, Math.min(w, h, d) * 0.3);
  const geo = r < 0.004 ? new RoundedBoxGeometry(w, h, d, 1, 0) : new RoundedBoxGeometry(w, h, d, 2, r);
  return place(new Mesh(geo, typeof color === 'number' ? mat(color) : color), x, y, z);
}

export function cyl(rTop: number, rBottom: number, h: number, color: number | MeshStandardMaterial, x = 0, y = 0, z = 0, seg = 12): Mesh {
  return place(new Mesh(new CylinderGeometry(rTop, rBottom, h, seg), typeof color === 'number' ? mat(color) : color), x, y, z);
}

/** Khối tròn low-poly (lá cây, bóng đèn). */
export function blob(r: number, color: number | MeshStandardMaterial, x = 0, y = 0, z = 0, detail = 1): Mesh {
  return place(new Mesh(new IcosahedronGeometry(r, detail), typeof color === 'number' ? mat(color, { flat: true }) : color), x, y, z);
}

/** Chậu đất nung có vành, đáy tại y = 0; trả về nhóm và độ cao miệng chậu. */
export function pot(r: number, h: number, color: number = KIT.terracotta): { g: Group; top: number } {
  const g = new Group();
  g.add(cyl(r, r * 0.75, h, color, 0, h / 2, 0, 10));
  g.add(cyl(r * 1.12, r * 1.12, h * 0.22, color, 0, h - h * 0.11, 0, 10));
  g.add(cyl(r * 0.95, r * 0.95, 0.02, 0x5a3a26, 0, h + 0.005, 0, 10)); // đất
  return { g, top: h };
}

/** Bụi cây tròn cắt tỉa trong chậu (giống topiary trong pack trang trí). */
export function topiary(scale = 1, tall = false): Group {
  const g = new Group();
  const { g: p, top } = pot(0.3, 0.42);
  g.add(p);
  if (tall) {
    g.add(cyl(0.05, 0.06, 0.9, KIT.woodDark, 0, top + 0.45, 0, 6));
    g.add(blob(0.48, KIT.leaf, 0, top + 1.25, 0));
    g.add(blob(0.3, KIT.leafDark, 0.25, top + 1.0, 0.18));
    g.add(blob(0.3, KIT.leafDark, -0.22, top + 1.05, -0.2));
  } else {
    g.add(blob(0.36, KIT.leaf, 0, top + 0.3, 0));
    g.add(blob(0.28, KIT.leafDark, 0.18, top + 0.55, 0.05));
  }
  g.scale.setScalar(scale);
  return g;
}

/** Dương xỉ: các lá hình nón dẹt tỏa ra từ chậu. */
export function fern(scale = 1): Group {
  const g = new Group();
  const { g: p, top } = pot(0.24, 0.32);
  g.add(p);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const frond = new Mesh(new ConeGeometry(0.09, 0.7, 4), mat(i % 2 ? KIT.leaf : KIT.leafDark, { flat: true }));
    frond.scale.z = 0.35;
    frond.position.set(Math.cos(a) * 0.2, top + 0.32, Math.sin(a) * 0.2);
    frond.rotation.set(0, -a, 0);
    frond.rotateZ(-0.75);
    frond.castShadow = true;
    g.add(frond);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Cây cọ: thân đốt so le hai tông, tán lá cong rủ xuống. */
export function palm(scale = 1): Group {
  const g = new Group();
  const { g: p, top } = pot(0.38, 0.5);
  g.add(p);
  const rings = 8;
  let y = top;
  for (let i = 0; i < rings; i++) {
    const r = 0.16 - i * 0.008;
    const h = 0.32;
    const ring = cyl(r * 0.9, r, h, i % 2 ? 0x9c6b42 : 0x8a5c37, Math.sin(i * 0.3) * 0.04 * i * 0.3, y + h / 2, 0, 7);
    g.add(ring);
    y += h;
  }
  const crown = new Vector3(0.12, y, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    // mỗi tàu lá là 3 đoạn dẹt nối nhau, cong dần xuống
    let px = crown.x;
    let py = crown.y;
    let pz = crown.z;
    for (let s = 0; s < 3; s++) {
      const len = 0.42 - s * 0.06;
      const droop = 0.15 + s * 0.4;
      const seg = rbox(len, 0.04, 0.26 - s * 0.06, s === 0 ? KIT.leafDark : KIT.leaf);
      const dx = Math.cos(a) * Math.cos(droop) * len;
      const dz = Math.sin(a) * Math.cos(droop) * len;
      const dy = -Math.sin(droop) * len;
      seg.position.set(px + dx / 2, py + dy / 2, pz + dz / 2);
      seg.rotation.set(0, -a, -droop);
      g.add(seg);
      px += dx;
      py += dy;
      pz += dz;
    }
  }
  g.add(blob(0.16, KIT.leafDark, crown.x, crown.y + 0.04, 0, 0));
  g.scale.setScalar(scale);
  return g;
}

/** Đèn lồng gắn tường: tay đỡ kim loại, lồng kính ấm, mái chóp (như đèn trong pack trang trí cửa). */
export function lantern(glow: number = KIT.glow): Group {
  const g = new Group();
  const metal = mat(KIT.metal);
  g.add(rbox(0.16, 0.24, 0.06, metal, 0, 0.1, 0)); // đế bắt tường
  g.add(rbox(0.05, 0.05, 0.32, metal, 0, 0.16, 0.16)); // tay đỡ
  const body = new Group();
  body.position.set(0, -0.08, 0.3);
  body.add(rbox(0.22, 0.05, 0.22, metal, 0, -0.17, 0));
  body.add(rbox(0.17, 0.28, 0.17, mat(0xfff1c9, { glow, glowIntensity: 1.3 }), 0, 0, 0));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) body.add(rbox(0.035, 0.3, 0.035, metal, dx * 0.095, 0, dz * 0.095));
  const roof = new Mesh(new ConeGeometry(0.19, 0.16, 4), metal);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.23;
  body.add(roof, cyl(0.03, 0.03, 0.06, metal, 0, 0.33, 0, 6));
  g.add(body);
  return g;
}

/** Tay nắm cửa kiểu gạt: tấm ốp bo tròn và cần gạt (side = hướng cần gạt). */
export function leverHandle(side: 1 | -1, color: number = KIT.gold): Group {
  const g = new Group();
  g.add(rbox(0.09, 0.3, 0.03, color, 0, 0, 0));
  g.add(cyl(0.025, 0.025, 0.07, color, 0, 0.05, 0.04, 8).rotateX(Math.PI / 2));
  g.add(rbox(0.2, 0.045, 0.045, color, side * 0.09, 0.05, 0.08));
  g.add(cyl(0.018, 0.018, 0.02, KIT.metal, 0, -0.08, 0.02, 8).rotateX(Math.PI / 2)); // lỗ khóa
  return g;
}

/** Dây đèn bóng tròn treo võng qua các điểm (dây tối màu, bóng phát sáng). */
export function bulbString(points: Vector3[], every: number, glow: number = KIT.glow): Group {
  const g = new Group();
  const curve = new CatmullRomCurve3(points);
  g.add(new Mesh(new TubeGeometry(curve, points.length * 8, 0.012, 4) as BufferGeometry, mat(0x2d2a26)));
  const n = Math.max(2, Math.round(curve.getLength() / every));
  const bulb = mat(0xfff1c9, { glow, glowIntensity: 1.6 });
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    g.add(cyl(0.025, 0.025, 0.05, KIT.metal, p.x, p.y - 0.03, p.z, 6));
    g.add(blob(0.06, bulb, p.x, p.y - 0.1, p.z, 0));
  }
  return g;
}

/** Vòng hoa tròn treo cửa. */
export function wreath(r = 0.3): Group {
  const g = new Group();
  g.add(new Mesh(new TorusGeometry(r, r * 0.22, 6, 14), mat(KIT.leafDark, { flat: true })));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(blob(r * 0.12, i % 2 ? 0xd6453d : 0xf2c14e, Math.cos(a) * r, Math.sin(a) * r, r * 0.18, 0));
  }
  return g;
}

/** Cây ngoài trời: thân gỗ và tán lá low-poly nhiều khối (không có chậu). */
export function tree(scale = 1, seed = 0): Group {
  const g = new Group();
  g.add(cyl(0.12, 0.16, 1.2, KIT.woodDark, 0, 0.6, 0, 7));
  const r = (k: number) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  g.add(blob(0.8, KIT.leaf, 0, 1.75, 0));
  g.add(blob(0.55, KIT.leafDark, 0.45 * (r(1) - 0.3), 1.5 + r(2) * 0.3, 0.4 * (r(3) - 0.5)));
  g.add(blob(0.5, KIT.leaf, -0.45 * r(4), 2.15 + r(5) * 0.2, 0.3 * (r(6) - 0.5)));
  g.scale.setScalar(scale);
  return g;
}
