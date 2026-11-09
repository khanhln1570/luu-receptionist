import {
  Box3,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';
import type { LobbyTheme } from './lobbyLayout';
import { KIT, mat, rbox, tree } from './kit';
import { loadModel } from './loader';

/** Mẫu nhà City Builder cho từng kiểu khách sạn. */
const BUILDING: Record<LobbyTheme, string> = { homestay: 'building_A', hotel: 'building_D', resort: 'building_E' };
/** Độ cao mặt nóc (đo từ model, không tính tháp nước trên nóc building_D) để đặt biển tên sát nóc. */
const ROOF: Record<string, number> = { building_A: 1.65, building_D: 2.35, building_E: 2.35 };
const BUILDING_SCALE = 1.15;
const SLOTS_X = [-4.5, 0, 4.5];
const ROW_Z = -1.2; // dãy nhà
const ROAD_Z = 0.8;
const FRONT_Z = 2.8; // vỉa hè phía trước
const ROAD_TOP = 0.1; // mặt trên của ô đường trong City Builder

export interface StreetHotel {
  id: string;
  name: string;
  theme: LobbyTheme;
}

interface Car {
  obj: Object3D;
  speed: number;
}

/**
 * Cảnh phố ngoài trời (màn chọn khách sạn): một con phố có ba tòa khách sạn dựng từ City Builder Bits,
 * xe chạy qua lại, mũi tên nhấp nhô trên tòa đang chọn. Có scene và camera riêng, không đụng sảnh.
 */
export class Street {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private buildings = new Map<string, Group>(); // id khách sạn -> tòa nhà
  private anchors = new Map<string, Vector3>(); // điểm đặt nhãn trên nóc
  private cars: Car[] = [];
  private marker = new Group();
  private markerFor: string | null = null;
  private time = 0;
  private ray = new Raycaster();

  private constructor() {
    this.scene.background = new Color(0x9fd6f0);
    this.scene.add(new HemisphereLight(0xffffff, 0x7f9a6a, 1.2));
    const sun = new DirectionalLight(0xfff1dc, 1.7);
    sun.position.set(5, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 30 });
    this.scene.add(sun);
    this.setAspect(16 / 9);
  }

  static async build(hotels: readonly StreetHotel[]): Promise<Street> {
    const s = new Street();
    await s.populate(hotels);
    return s;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // Màn hẹp thì lùi camera để vẫn thấy đủ ba tòa
    const k = aspect < 1.5 ? 1.5 / aspect : 1;
    this.camera.position.set(0, 5.2 * k, 10 * k);
    this.camera.lookAt(0, 1.9, -1.2);
    this.camera.updateProjectionMatrix();
  }

  private async populate(hotels: readonly StreetHotel[]): Promise<void> {
    const put = async (model: string, x: number, z: number, rotY = 0, scale = 1): Promise<Group> => {
      const m = await loadModel('city-builder-bits', model);
      m.position.set(x, 0, z);
      m.rotation.y = rotY;
      m.scale.setScalar(scale);
      m.traverse((o) => {
        if (o instanceof Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.scene.add(m);
      return m;
    };

    // Nền cỏ, đường, vỉa hè
    const grass = new Mesh(new PlaneGeometry(80, 40), new MeshStandardMaterial({ color: 0x8cc46f, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.01;
    grass.receiveShadow = true;
    this.scene.add(grass);
    const jobs: Promise<unknown>[] = [];
    for (let x = -14; x <= 14; x += 2) {
      jobs.push(put(x === 0 ? 'road_straight_crossing' : 'road_straight', x, ROAD_Z, Math.PI / 2)); // ô đường mặc định chạy dọc trục z, xoay cho chạy dọc phố
      jobs.push(put('base', x, FRONT_Z));
      if (!SLOTS_X.some((sx) => Math.abs(sx - x) < 1.4)) jobs.push(put('base', x, ROW_Z));
    }

    // Ba tòa khách sạn, mỗi tòa có biển tên trên nóc
    hotels.slice(0, SLOTS_X.length).forEach((h, i) => {
      const x = SLOTS_X[i]!;
      jobs.push(
        put(BUILDING[h.theme], x, ROW_Z, 0, BUILDING_SCALE).then((b) => {
          b.userData.hotelId = h.id;
          this.buildings.set(h.id, b);
          const top = ROOF[BUILDING[h.theme]]! * BUILDING_SCALE;
          const sign = roofSign(h.name, h.theme);
          sign.position.set(x, top + 0.05, ROW_Z + 0.6);
          this.scene.add(sign);
          this.anchors.set(h.id, new Vector3(x, top + 0.95, ROW_Z + 0.6));
        }),
      );
    });

    // Nhà hàng xóm hai đầu phố
    for (const [model, x] of [['building_C', -9], ['building_G', 9], ['building_B', -13], ['building_H', 13]] as const) jobs.push(put(model, x, ROW_Z, 0, 1.1));

    // Hàng cây sau dãy nhà
    for (let i = 0, x = -15; x <= 15; x += 1.7, i++) {
      const t = tree(0.9 + (i % 3) * 0.2, i);
      t.position.set(x + (i % 2) * 0.5, 0, -4 - (i % 3) * 0.7);
      t.traverse((o) => (o.castShadow = true));
      this.scene.add(t);
    }

    // Đồ trên vỉa hè
    for (const x of [-6.75, -2.25, 2.25, 6.75]) {
      jobs.push(put('streetlight', x, FRONT_Z - 0.6, Math.PI, 1.6));
      jobs.push(put('bush', x + 0.5, ROW_Z + 0.75, 0, 1.6));
    }
    for (const x of [-11, -5.5, 5.5, 11]) jobs.push(put('bench', x, FRONT_Z + 0.3, Math.PI, 1.5));
    jobs.push(put('trafficlight_A', -1.2, FRONT_Z - 0.6, Math.PI, 1.4), put('firehydrant', 3.2, FRONT_Z - 0.5, 0, 1.4));
    // Xe: đặt bánh xe lên mặt đường (model có gốc nằm trên đáy bánh xe một chút)
    const car = (model: string, x: number, z: number, rotY: number, speed: number) =>
      put(model, x, z, rotY, 1.3).then((c) => {
        c.updateMatrixWorld(true);
        c.position.y += ROAD_TOP - new Box3().setFromObject(c).min.y;
        this.cars.push({ obj: c, speed });
      });
    jobs.push(car('car_taxi', -3.2, ROAD_Z - 0.35, Math.PI / 2, 0)); // taxi đỗ trước cửa
    jobs.push(car('car_sedan', -10, ROAD_Z - 0.45, Math.PI / 2, 2.2));
    jobs.push(car('car_stationwagon', 8, ROAD_Z + 0.45, -Math.PI / 2, -1.8));
    await Promise.all(jobs);

    // Mũi tên chỉ tòa đang chọn
    const cone = new Mesh(new ConeGeometry(0.28, 0.5, 4), mat(KIT.gold, { glow: 0xffb000, glowIntensity: 0.5 }));
    cone.rotation.x = Math.PI;
    const ring = new Mesh(new TorusGeometry(0.2, 0.06, 6, 16), mat(KIT.gold, { glow: 0xffb000, glowIntensity: 0.5 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.38;
    this.marker.add(cone, ring);
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  /** Tòa khách sạn dưới con trỏ (x, y là pixel trong canvas cỡ w × h). */
  pick(x: number, y: number, w: number, h: number): string | null {
    this.ray.setFromCamera(new Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects([...this.buildings.values()], true)[0];
    let o: Object3D | null = hit?.object ?? null;
    while (o && !o.userData.hotelId) o = o.parent;
    return (o?.userData.hotelId as string | undefined) ?? null;
  }

  /** Vị trí nhãn tên trên nóc từng tòa, theo pixel. */
  labels(w: number, h: number): Array<{ id: string; x: number; y: number }> {
    return [...this.anchors].map(([id, p]) => {
      const v = p.clone().project(this.camera);
      return { id, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    });
  }

  /** Đặt mũi tên lên tòa đang chọn hoặc đang rê chuột (null = ẩn). */
  point(id: string | null): void {
    this.markerFor = id;
  }

  update(dt: number): void {
    this.time += dt;
    for (const c of this.cars) {
      if (c.speed === 0) continue;
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > 15) c.obj.position.x = -15;
      if (c.obj.position.x < -15) c.obj.position.x = 15;
    }
    const a = this.markerFor ? this.anchors.get(this.markerFor) : undefined;
    this.marker.visible = !!a;
    if (a) {
      this.marker.position.set(a.x, a.y + 0.2 + Math.sin(this.time * 3) * 0.12, a.z);
      this.marker.rotation.y = this.time * 1.5;
    }
  }
}

/** Biển tên trên nóc nhà: bảng gỗ bo cạnh với chữ vẽ bằng canvas, hai chân đỡ. */
function roofSign(name: string, theme: LobbyTheme): Group {
  const g = new Group();
  const colors: Record<LobbyTheme, [string, string]> = { homestay: ['#6b4427', '#fbe9c6'], hotel: ['#2b1a1d', '#f3d98b'], resort: ['#1f6f78', '#fff6e0'] };
  const [bg, fg] = colors[theme];
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 60;
  do ctx.font = `bold ${size--}px sans-serif`;
  while (ctx.measureText(name).width > 470 && size > 20);
  ctx.fillText(name, 256, 66);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  const w = 2.1;
  g.add(rbox(w + 0.12, 0.62, 0.1, KIT.woodDark, 0, 0.55, 0));
  const face = new Mesh(new PlaneGeometry(w, 0.5), new MeshStandardMaterial({ map: tex, roughness: 1 }));
  face.position.set(0, 0.55, 0.055);
  g.add(face);
  for (const x of [-0.7, 0.7]) g.add(rbox(0.07, 0.3, 0.07, KIT.metal, x, 0.12, -0.02));
  return g;
}
