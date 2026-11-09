import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  AdditiveBlending,
  Box3,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';
import type { LobbyTheme } from './lobbyLayout';
import { KIT, mat, rbox, tree } from './kit';
import { loadModel } from './loader';
import { Rng } from '../core/rng';
import { createCharacter, loadClips } from './characters';
import { LOOKS, POLICE, type Look } from '../data/looks';

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
const PERSON_HEIGHT = 0.46; // xe sedan sau khi phóng dài ~1.2 (≈4.5 m) nên 1 đơn vị ≈ 3.7 m, người 1.7 m ≈ 0.46

export interface StreetHotel {
  id: string;
  name: string;
  theme: LobbyTheme;
}

/** Mốc màu trời / ánh sáng theo giờ trong ngày (giờ thập phân, 0–24). night: 0 = ban ngày, 1 = ban đêm. */
interface DayKey {
  h: number;
  sky: number;
  amb: number;
  ambCol: number;
  night: number;
}
const DAY_KEYS: DayKey[] = [
  { h: 0, sky: 0x0b1030, amb: 0.4, ambCol: 0x7080c0, night: 1 },
  { h: 5, sky: 0x151a40, amb: 0.4, ambCol: 0x7080c0, night: 1 },
  { h: 6, sky: 0xf0a07a, amb: 0.75, ambCol: 0xffd0b0, night: 0.6 },
  { h: 7.5, sky: 0x9fd6f0, amb: 1.2, ambCol: 0xffffff, night: 0 },
  { h: 17, sky: 0x9fd6f0, amb: 1.2, ambCol: 0xffffff, night: 0 },
  { h: 18.5, sky: 0xf28a5a, amb: 0.85, ambCol: 0xffc8a0, night: 0.5 },
  { h: 19.5, sky: 0x1c2050, amb: 0.5, ambCol: 0x8090d0, night: 1 },
  { h: 24, sky: 0x0b1030, amb: 0.4, ambCol: 0x7080c0, night: 1 },
];

interface Walker {
  obj: Object3D;
  mixer: AnimationMixer;
  speed: number;
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
  private walkers: Walker[] = [];
  private hemi = new HemisphereLight(0xffffff, 0x7f9a6a, 1.2);
  private sun = new DirectionalLight(0xfff1dc, 1.7);
  private bulbs: MeshStandardMaterial[] = []; // bóng đèn đường, sáng về đêm
  private lampLights: PointLight[] = [];
  /** Giờ của trời ngoài phố (thập phân 0–24): giờ máy, hoặc giờ đang tua. */
  hour = 8; // giờ trong ngày (thập phân), do main.ts đặt theo đồng hồ khách sạn
  private glows: Array<{ m: MeshBasicMaterial; max: number }> = []; // cửa sổ, đèn xe: độ sáng = night × max
  private stars!: Points;
  private moon!: Group;
  private sunDisc!: Group;
  private marker = new Group();
  private markerFor: string | null = null;
  private time = 0;
  private ray = new Raycaster();

  private constructor() {
    this.scene.background = new Color(0x9fd6f0);
    this.scene.add(this.hemi);
    const sun = this.sun;
    sun.position.set(5, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 30 });
    this.scene.add(sun);
    this.addSky();
    this.setAspect(16 / 9);
  }

  static async build(hotels: readonly StreetHotel[]): Promise<Street> {
    const s = new Street();
    await s.populate(hotels);
    return s;
  }

  /** Sao, trăng (đêm) và mặt trời (ngày) trên một tấm nền xa ở z = SKY_Z, trong vùng trời camera nhìn thấy. */
  private addSky(): void {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = 1 + Math.random() * 13;
      pos[i * 3 + 2] = SKY_Z - Math.random() * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    this.stars = new Points(geo, new PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.stars);
    const disc = (r: number, color: number, glow: number, glowSize: number) => {
      const g = new Group();
      g.add(new Mesh(new SphereGeometry(r, 24, 16), new MeshBasicMaterial({ color, transparent: true, opacity: 0 })));
      g.add(new Mesh(new PlaneGeometry(glowSize, glowSize), new MeshBasicMaterial({ map: haloTex(), color: glow, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })));
      this.scene.add(g);
      return g;
    };
    this.moon = disc(0.9, 0xf4f1d8, 0x9fb4ff, 5);
    this.sunDisc = disc(1.2, 0xfff3b0, 0xffd27a, 9);
  }

  /** Đặt mặt trời/trăng lên vòng cung trời theo pha (0 = mọc phía đông bên trái, 1 = lặn phía tây bên phải). */
  private placeOnArc(g: Group, phase: number, opacity: number): void {
    const elev = Math.sin(Math.PI * phase);
    g.position.set(-Math.cos(Math.PI * phase) * 22, 1.5 + elev * 4.8, SKY_Z + 1); // đỉnh vòng cung vẫn nằm dưới mép trên khung hình
    g.visible = opacity > 0.01;
    const [body, halo] = g.children as [Mesh, Mesh];
    (body.material as MeshBasicMaterial).opacity = opacity;
    (halo.material as MeshBasicMaterial).opacity = opacity * 0.8;
  }

  /** Bóng đèn đường (phát sáng về đêm) kèm một đèn điểm hắt xuống vỉa hè. */
  private addLamp(x: number, z: number): void {
    const m = new MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffc15a, emissiveIntensity: 0 });
    const bulb = new Mesh(new SphereGeometry(0.06, 12, 8), m);
    bulb.position.set(x, 1.5, z);
    const light = new PointLight(0xffc977, 0, 3.4, 1.6);
    light.position.set(x, 1.4, z);
    this.bulbs.push(m);
    this.lampLights.push(light);
    this.scene.add(bulb, light);
  }

  /** Cập nhật trời, nắng/trăng và đèn đường theo giờ hiện tại của máy. */
  private applyDaylight(h: number): void {
    let i = 0;
    while (i < DAY_KEYS.length - 2 && h >= DAY_KEYS[i + 1]!.h) i++;
    const a = DAY_KEYS[i]!;
    const b = DAY_KEYS[i + 1]!;
    const t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const sky = new Color(a.sky).lerp(new Color(b.sky), t);
    (this.scene.background as Color).copy(sky);
    this.hemi.intensity = lerp(a.amb, b.amb);
    this.hemi.color.copy(new Color(a.ambCol).lerp(new Color(b.ambCol), t));
    const night = lerp(a.night, b.night);

    // Mặt trời mọc 6h lặn 18h; ngoài khoảng đó đèn định hướng là ánh trăng đi theo cùng một vòng cung
    const day = h >= 6 && h < 18;
    const phase = day ? (h - 6) / 12 : (((h - 18 + 24) % 24) / 12);
    const elev = Math.sin(Math.PI * phase);
    this.sun.position.set(-Math.cos(Math.PI * phase) * 9, 3 + elev * 8, 7);
    if (day) {
      this.sun.color.set(0xffa060).lerp(new Color(0xfff1dc), Math.min(1, elev * 2));
      this.sun.intensity = 1.7 * Math.min(1, 0.15 + elev * 1.6);
    } else {
      this.sun.color.set(0x9bb4ff);
      this.sun.intensity = 0.55 * Math.min(1, 0.2 + elev * 1.5);
    }

    for (const g of this.glows) g.m.opacity = night * g.max;
    for (const m of this.bulbs) m.emissiveIntensity = night * 2.2;
    for (const l of this.lampLights) l.intensity = night * 1.4;
    (this.stars.material as PointsMaterial).opacity = Math.max(0, night * 2 - 1);
    const dark = Math.max(0, night * 2 - 1);
    this.stars.visible = dark > 0.01;
    // Đĩa mặt trời đổi sang cam khi thấp; trăng đi cùng vòng cung ban đêm
    const sunBody = (this.sunDisc.children[0] as Mesh).material as MeshBasicMaterial;
    sunBody.color.set(0xff9a50).lerp(new Color(0xfff3b0), Math.min(1, elev * 2));
    this.placeOnArc(this.sunDisc, day ? phase : 0, day ? 1 - night * 0.6 : 0);
    this.placeOnArc(this.moon, day ? 0 : phase, day ? 0 : dark);
  }

  /** Đèn về đêm của một tòa: sảnh tầng trệt luôn sáng, cửa sổ tầng trên bật ngẫu nhiên khoảng 60% (cố định theo id khách sạn). */
  private addNightWindows(model: string, x: number, id: string): void {
    const grid = WINDOWS[model]!;
    let seed = 2166136261;
    for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
    const rng = new Rng(seed);
    const tints = [0xffd27a, 0xffe2a0, 0xffc060, 0xfff0c8];
    const front = ROW_Z + FACADE_Z * BUILDING_SCALE + 0.004;
    // Sảnh tầng trệt: luôn sáng, ấm và sáng hơn phòng ở tầng trên
    for (const [cx, cy, w, h] of LOBBY[model]!) {
      const m = new MeshBasicMaterial({ map: windowGlowTex(), color: 0xffd890, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
      const pane = new Mesh(new PlaneGeometry(w * BUILDING_SCALE, h * BUILDING_SCALE), m);
      pane.position.set(x + cx * BUILDING_SCALE, cy * BUILDING_SCALE, front);
      this.scene.add(pane);
      this.glows.push({ m, max: 1 });
    }
    // Ánh đèn sảnh hắt ra mặt đường trước cửa
    const spillMat = new MeshBasicMaterial({ map: haloTex(), color: 0xffc977, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const spill = new Mesh(new PlaneGeometry(2, 0.6), spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(x, ROAD_TOP + 0.006, front + 0.15);
    this.scene.add(spill);
    this.glows.push({ m: spillMat, max: 0.7 });
    for (const y of grid.ys) {
      for (const wx of grid.xs) {
        if (!rng.chance(0.6)) continue;
        // Chỉ phủ phần kính (khung trắng lộ ra), cộng sáng để thanh chia kính và rèm bên dưới vẫn thấy
        const m = new MeshBasicMaterial({ map: windowGlowTex(), color: rng.pick(tints), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
        const pane = new Mesh(new PlaneGeometry(0.19, 0.28), m);
        pane.position.set(x + wx * BUILDING_SCALE, y * BUILDING_SCALE + 0.01, front);
        this.scene.add(pane);
        this.glows.push({ m, max: 0.9 });
      }
    }
  }

  /** Đèn pha, đèn hậu và vệt sáng trên mặt đường cho một chiếc xe (chỉ thấy về đêm). Mũi xe là +z cục bộ. */
  private addCarLights(c: Object3D): void {
    c.updateMatrixWorld(true);
    const wb = new Box3().setFromObject(c);
    const a = c.worldToLocal(wb.min.clone());
    const b = c.worldToLocal(wb.max.clone());
    const lo = new Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
    const hi = new Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
    const half = (hi.x - lo.x) * 0.3;
    const y = lo.y + (hi.y - lo.y) * 0.32;
    const lamp = (hex: number, z: number, sx: number, max: number) => {
      const m = new MeshBasicMaterial({ color: hex, transparent: true, opacity: 0 });
      const bulb = new Mesh(new SphereGeometry(0.035, 8, 6), m);
      bulb.position.set(sx * half, y, z);
      c.add(bulb);
      this.glows.push({ m, max });
    };
    for (const sx of [-1, 1]) {
      lamp(0xfff6d0, hi.z, sx, 1);
      lamp(0xff2a1a, lo.z, sx, 1);
    }
    const beamMat = new MeshBasicMaterial({ map: beamTex(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const beam = new Mesh(new PlaneGeometry((hi.x - lo.x) * 1.5, 1.1), beamMat);
    beam.rotation.x = -Math.PI / 2; // nằm phẳng trên mặt đường; mép sáng nhất (đầu ảnh) áp sát mũi xe
    beam.position.set(0, lo.y + 0.02, hi.z + 0.55);
    c.add(beam);
    this.glows.push({ m: beamMat, max: 0.55 });
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
          this.addNightWindows(BUILDING[h.theme], x, h.id);
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
      this.addLamp(x + 0.25, FRONT_Z - 0.6); // đầu đèn của model nằm lệch cột 0.25 sau khi xoay
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
        if (speed !== 0) this.addCarLights(c); // xe đỗ thì tắt máy, không bật đèn
      });
    jobs.push(car('car_taxi', -3.2, FRONT_Z - 0.7, Math.PI / 2, 0)); // taxi đỗ sát mép vỉa hè, ngoài làn xe chạy; người đi bộ ở z ≥ 2.6 nên không vướng
    jobs.push(car('car_sedan', -10, ROAD_Z - 0.45, Math.PI / 2, 2.2));
    jobs.push(car('car_stationwagon', 8, ROAD_Z + 0.45, -Math.PI / 2, -1.8));
    jobs.push(car('car_police', 8.5, FRONT_Z - 0.7, -Math.PI / 2, 0)); // xe cảnh sát đỗ sát mép vỉa hè
    await Promise.all(jobs);
    await this.addWalkers();

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

  /** Người đi bộ trên vỉa hè trước dãy nhà, hai chiều, tỉ lệ theo xe. */
  private async addWalkers(): Promise<void> {
    const clips = await loadClips();
    // [x xuất phát, z, vận tốc (âm = đi ngược), ngoại hình]
    const plan: Array<[number, number, number, Look]> = [
      [-11, FRONT_Z - 0.1, 0.45, LOOKS[0]!],
      [-4, FRONT_Z + 0.25, -0.38, LOOKS[1]!],
      [-0.5, FRONT_Z - 0.2, 0.5, LOOKS[2]!],
      [5, FRONT_Z + 0.2, -0.42, LOOKS[3]!],
      [10, FRONT_Z - 0.1, 0.36, LOOKS[4]!],
      [13, FRONT_Z + 0.25, -0.48, LOOKS[5]!],
      // Hai cảnh sát đi tuần cạnh nhau, chậm hơn người thường
      [-8, FRONT_Z + 0.05, 0.3, POLICE[0]!],
      [-7.4, FRONT_Z + 0.05, 0.3, POLICE[1]!],
      // Một cảnh sát đi tuần ngược chiều
      [7, FRONT_Z + 0.05, -0.3, POLICE[1]!],
    ];
    await Promise.all(
      plan.map(async ([x, z, speed, look]) => {
        const char = await createCharacter(look);
        const box = new Box3();
        char.root.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh && m.visible && m.geometry) {
            m.geometry.computeBoundingBox();
            box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
          }
        });
        char.root.scale.setScalar(PERSON_HEIGHT / Math.max(0.1, box.max.y - box.min.y));
        char.root.position.set(x, ROAD_TOP, z);
        char.root.rotation.y = speed > 0 ? Math.PI / 2 : -Math.PI / 2;
        char.mixer.stopAllAction();
        const walk = char.mixer.clipAction(clips.get('Walking_A')!);
        walk.timeScale = Math.abs(speed) / 0.45; // chân bước khớp với tốc độ
        walk.play();
        char.mixer.setTime(x * 0.13 % 1);
        this.scene.add(char.root);
        this.walkers.push({ obj: char.root, mixer: char.mixer, speed });
      }),
    );
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

  /** Đặt giờ trong ngày cho trời, đèn đường... (đồng bộ với đồng hồ khách sạn). */
  setHour(hour: number): void {
    this.hour = hour;
  }

  /** Đặt mũi tên lên tòa đang chọn hoặc đang rê chuột (null = ẩn). */
  point(id: string | null): void {
    this.markerFor = id;
  }

  update(dt: number): void {
    this.time += dt;
    this.applyDaylight(this.hour);
    for (const c of this.cars) {
      if (c.speed === 0) continue;
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > 15) c.obj.position.x = -15;
      if (c.obj.position.x < -15) c.obj.position.x = 15;
    }
    for (const w of this.walkers) {
      w.mixer.update(dt);
      w.obj.position.x += w.speed * dt;
      if (w.obj.position.x > 15) w.obj.position.x = -15;
      if (w.obj.position.x < -15) w.obj.position.x = 15;
    }
    const a = this.markerFor ? this.anchors.get(this.markerFor) : undefined;
    this.marker.visible = !!a;
    if (a) {
      this.marker.position.set(a.x, a.y + 0.2 + Math.sin(this.time * 3) * 0.12, a.z);
      this.marker.rotation.y = this.time * 1.5;
    }
  }
}

/** Mặt khung cửa sổ trên tường mặt tiền (z cục bộ model): tường ở 0.9, khung nhô ra thêm một chút. */
const FACADE_Z = 0.92;
/** Tâm cửa sổ tầng trên của từng mẫu nhà (toạ độ cục bộ model, trước BUILDING_SCALE), đo từ ảnh dựng thật. */
const WINDOWS: Record<string, { xs: number[]; ys: number[] }> = {
  building_A: { xs: [-0.279, 0.104, 0.498], ys: [1.355] },
  building_D: { xs: [-0.567, -0.198, 0.192, 0.577], ys: [1.358, 2.054] },
  building_E: { xs: [-0.904, -0.517, -0.131, 0.254, 0.638], ys: [1.355, 2.045] },
};
/** Kính tầng trệt (sảnh lễ tân): [tâm x, tâm y, rộng, cao] theo toạ độ cục bộ model, đo từ ảnh dựng thật. Luôn sáng về đêm. */
const LOBBY: Record<string, Array<[number, number, number, number]>> = {
  building_A: [[-0.23, 0.512, 0.187, 0.332], [0.356, 0.571, 0.542, 0.284]], // cửa kính, ô kính lớn
  building_D: [[-0.577, 0.709, 0.131, 0.033], [-0.191, 0.607, 0.143, 0.245], [0.196, 0.607, 0.151, 0.245], [0.576, 0.607, 0.139, 0.245]], // ô kính trên cửa gỗ, ba cửa sổ
  building_E: [[-0.729, 0.577, 0.484, 0.296], [-0.138, 0.512, 0.094, 0.332], [0.431, 0.577, 0.485, 0.296]], // hai ô kính lớn, cửa kính
};
const SKY_Z = -32; // tấm trời xa: sao, trăng, mặt trời (sau mép cỏ ở z = -20)
/** Ánh đèn trong phòng nhìn qua kính: sáng ấm ở giữa-dưới, mờ dần ra mép để không thành khối phẳng. */
let windowGlowTexture: CanvasTexture | null = null;
function windowGlowTex(): CanvasTexture {
  if (windowGlowTexture) return windowGlowTexture;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 96;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 60, 4, 32, 54, 60);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 96);
  windowGlowTexture = new CanvasTexture(cv);
  windowGlowTexture.colorSpace = SRGBColorSpace;
  return windowGlowTexture;
}

/** Quầng sáng tròn mờ dần (dùng cho mặt trời và trăng). */
let haloTexture: CanvasTexture | null = null;
function haloTex(): CanvasTexture {
  if (haloTexture) return haloTexture;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTexture = new CanvasTexture(cv);
  haloTexture.colorSpace = SRGBColorSpace;
  return haloTexture;
}

/** Vệt sáng đèn pha: sáng nhất sát mũi xe (đầu ảnh), loe ra và tắt dần. */
let beamTexture: CanvasTexture | null = null;
function beamTex(): CanvasTexture {
  if (beamTexture) return beamTexture;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,240,190,0.9)');
  g.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(50, 0);
  ctx.lineTo(64, 128);
  ctx.lineTo(0, 128);
  ctx.closePath();
  ctx.fill();
  beamTexture = new CanvasTexture(cv);
  beamTexture.colorSpace = SRGBColorSpace;
  return beamTexture;
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
