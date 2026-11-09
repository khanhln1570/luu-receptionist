import { Group, Mesh, SphereGeometry, TorusGeometry } from 'three';
import { KIT, cyl, mat, rbox, topiary } from './kit';
import type { Rect } from './navigation';
import type { LobbyTheme } from './lobbyLayout';

/** Mặt quầy cao bao nhiêu theo kiểu sảnh (homestay thấp hơn một chút). */
const counterTop = (theme: LobbyTheme): number => (theme === 'homestay' ? 1 : 1.06);

/** Đồ hiện ra trong sảnh theo các nâng cấp đã mua, kèm vùng chiếm chỗ để khách đi vòng. */
export function buildUpgradeProps(theme: LobbyTheme, owned: readonly string[]): { group: Group; obstacles: Rect[] } {
  const group = new Group();
  const obstacles: Rect[] = [];
  const has = (id: string) => owned.includes(id);
  const block = (x: number, z: number, w: number, d: number) => obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  if (has('sofa')) {
    // Gối nhung đỏ trên hai sofa dựa tường xa
    for (const [x, tilt] of [[-6.0, 0.18], [-5.0, -0.18], [5.0, 0.18], [6.0, -0.18]] as const) {
      const c = rbox(0.55, 0.5, 0.2, 0xb3263b, x, 0.95, -8.55);
      c.rotation.z = tilt;
      c.rotation.x = -0.25;
      group.add(c);
    }
  }

  if (has('wifi')) {
    // Bộ phát wifi trên quầy: thân, hai ăng-ten, đèn xanh và hai vòng sóng
    const top = counterTop(theme);
    const r = new Group();
    r.position.set(-0.5, top, 1.25);
    r.add(rbox(0.5, 0.1, 0.32, 0x23252e, 0, 0.05, 0));
    for (const x of [-0.17, 0.17]) r.add(cyl(0.015, 0.015, 0.3, 0x23252e, x, 0.25, -0.08, 6));
    r.add(new Mesh(new SphereGeometry(0.025, 8, 6), mat(0x4ee07a, { glow: 0x4ee07a, glowIntensity: 1.2 })).translateX(0.18).translateY(0.1).translateZ(0.17));
    for (const [rad, op] of [[0.28, 0.5], [0.42, 0.3]] as const) {
      const ring = new Mesh(new TorusGeometry(rad, 0.012, 6, 24, Math.PI), mat(0x7fd0ff, { glow: 0x7fd0ff, glowIntensity: 0.9, opacity: op }));
      ring.position.set(0, 0.5, -0.08);
      r.add(ring);
    }
    group.add(r);
  }

  if (has('renovate')) {
    for (const x of [-6.9, 6.9]) {
      const t = topiary(1.15, true);
      t.position.set(x, 0, 1.0);
      group.add(t);
      block(x, 1.0, 0.7, 0.7);
    }
  }

  if (has('housekeeper')) {
    // Xe đẩy buồng phòng: khung kim loại, khăn xếp chồng, bánh xe
    const cart = new Group();
    cart.position.set(-6.9, 0, 2.6);
    cart.add(rbox(0.95, 0.06, 0.55, KIT.metal, 0, 0.35, 0), rbox(0.95, 0.06, 0.55, KIT.metal, 0, 0.8, 0));
    for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]] as const) {
      cart.add(cyl(0.015, 0.015, 0.85, KIT.metal, x, 0.43, z, 6));
      cart.add(cyl(0.06, 0.06, 0.04, 0x1d1f26, x, 0.06, z, 10).rotateZ(Math.PI / 2));
    }
    for (let i = 0; i < 3; i++) cart.add(rbox(0.4, 0.07, 0.3, [0xffffff, 0x9fd0ee, 0xffffff][i]!, -0.2, 0.86 + i * 0.07, 0));
    cart.add(rbox(0.25, 0.2, 0.25, 0x4aa3e8, 0.28, 0.48, 0));
    group.add(cart);
    block(-6.9, 2.6, 1.1, 0.7);
  }

  if (has('maintenance')) {
    // Hộp đồ nghề đỏ có quai xách
    const box = new Group();
    box.position.set(6.9, 0, 2.6);
    box.add(rbox(0.7, 0.35, 0.35, 0xc0392b, 0, 0.18, 0), rbox(0.5, 0.05, 0.05, KIT.metal, 0, 0.4, 0));
    box.add(rbox(0.04, 0.16, 0.04, KIT.metal, -0.24, 0.35, 0), rbox(0.04, 0.16, 0.04, KIT.metal, 0.24, 0.35, 0));
    group.add(box);
    block(6.9, 2.6, 0.8, 0.5);
  }

  group.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true;
  });
  return { group, obstacles };
}
