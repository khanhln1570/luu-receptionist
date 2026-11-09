import { Box3, CylinderGeometry, LoopRepeat, MathUtils, Mesh, MeshStandardMaterial, Vector3, type AnimationAction, type Bone, type Camera, type Scene } from 'three';
import type { Game } from '../core/game';
import { LOOKS, lookIdFor } from '../data/looks';
import { NavGrid, type Pt, type Rect } from './navigation';
import { createCharacter, loadClips, type Character } from './characters';
import type { DoorRig } from './lobby';

const HEIGHT = 1.6; // chiều cao khách (đơn vị cảnh; bàn cao 1)
const WALK_SPEED = 2.4;
const DOOR = new Vector3(0, 0, -9.3); // điểm đứng ngay trong cửa
const OUTSIDE = { x: 0, z: -11.5 }; // ngoài cửa, nơi khách xuất hiện và biến mất
const DOOR_PLANE_Z = -10.1;
const COUNTER = new Vector3(0, 0, -1.5);
const LINE_SLOTS = 3; // số khách đứng xếp hàng, người sau ngồi ghế chờ
const SIT_DROP = 0;
const SIT_THIGH = -1.45; // góc gập đùi/cẳng chân khi ngồi (rad)
const SIT_SHIN = 1.5;
const LINE_X = [-0.3, 1.5, -1.9];

/** Ghế chờ: [x, z, góc xoay]. Khách ngồi quay mặt về phía quầy/camera (+z). */
const SEATS: Array<[number, number, number]> = [
  [-6.3, -7.55, 0],
  [-4.7, -7.55, 0],
  [-2.6, -7.45, 0.2],
  [2.6, -7.45, -0.2],
  [4.7, -7.55, 0],
  [6.3, -7.55, 0],
  [4.5, -2.5, 0.35],
  [5.7, -2.3, -0.25],
];
/** Cặp ghế cạnh nhau (cùng sofa) để khách ngồi nói chuyện. */
const SEAT_PAIR: Record<number, number> = { 0: 1, 1: 0, 4: 5, 5: 4 };
const MAX_AMBIENT = 4;

const OVERFLOW: Array<[number, number]> = [[-3, -4.5], [3, -4.5], [-4.5, -3], [-1.5, -5.5], [1.5, -5.5], [-6, -4.5]];

interface Ambient {
  stops: Array<{ x: number; z: number; yaw: number; wait: number }>; // các điểm đi dạo
  stage: number;
  waitUntil: number | null;
  seatWanted: boolean;
  sitUntil: number | null;
}

/** Khóa đích dùng chung giữa việc đặt đích và nhận biết khách đã tới nơi. */
const goalKeyOf = (p: Vector3): string => `${p.x.toFixed(2)},${p.z.toFixed(2)}`;

interface Actor {
  char: Character;
  walk: AnimationAction;
  idle: AnimationAction;
  seat: number | null;
  y: number;
  yaw: number;
  moving: boolean;
  path: Pt[];
  goalKey: string;
  sit: number; // 0 đứng, 1 ngồi
  legs: Array<{ bone: Bone; angle: number }>;
}

/** Hiển thị khách 3D trong sảnh: vào qua cửa, xếp hàng, ngồi chờ, đứng ở quầy và đi ra. */
export class GuestScene {
  private actors = new Map<string, Actor>();
  private loading = new Set<string>();
  private game: Game | null = null;
  private doorOpen = 0;
  private nav: NavGrid | null = null;
  /** Khách đang ở khách sạn xuống sảnh uống cà phê: id -> thời điểm (giây) đứng dậy ra về. */
  private ambient = new Map<string, Ambient>();
  private clock = 0;
  private nextAmbient = 6;

  constructor(
    private readonly scene: Scene,
    private door: DoorRig,
    obstacles: Rect[] = [],
  ) {
    this.setLobby(door, obstacles);
  }

  /** Đặt cửa và vật cản của sảnh hiện tại (dựng lại lưới điều hướng). */
  setLobby(door: DoorRig, obstacles: Rect[]): void {
    this.door = door;
    this.nav = new NavGrid({ minX: -7.6, maxX: 7.6, minZ: -9.6, maxZ: 3.2 }, obstacles);
    for (const a of this.actors.values()) a.goalKey = ''; // tìm lại đường theo sảnh mới
  }

  private clear(): void {
    for (const a of this.actors.values()) this.scene.remove(a.char.root);
    this.actors.clear();
    this.loading.clear();
    this.ambient.clear();
    this.clock = 0;
    this.nextAmbient = 6;
  }

  private async spawn(id: string, name: string, mug = false): Promise<void> {
    this.loading.add(id);
    const look = LOOKS.find((l) => l.id === lookIdFor(name))!;
    const clips = await loadClips();
    const char = await createCharacter(look);
    if (!this.loading.delete(id)) return; // đã bị xóa (đổi ngày) trong lúc tải
    const box = new Box3();
    char.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.visible && m.geometry) {
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      }
    });
    char.root.scale.setScalar(HEIGHT / Math.max(0.1, box.max.y - box.min.y));
    char.root.position.set(OUTSIDE.x, 0, OUTSIDE.z);
    const idle = char.mixer.clipAction(clips.get('Idle_A')!);
    const walk = char.mixer.clipAction(clips.get('Walking_A')!);
    for (const a of [idle, walk]) a.setLoop(LoopRepeat, Infinity);
    walk.enabled = true;
    walk.play();
    walk.setEffectiveWeight(0);
    if (mug) {
      const cup = new Mesh(new CylinderGeometry(0.1, 0.08, 0.16, 12), new MeshStandardMaterial({ color: 0xf7f2ea, roughness: 0.5 }));
      const coffee = new Mesh(new CylinderGeometry(0.085, 0.085, 0.02, 12), new MeshStandardMaterial({ color: 0x4a2c17 }));
      coffee.position.y = 0.075;
      cup.add(coffee);
      // GLTFLoader bỏ dấu chấm trong tên xương: "handslot.r" thành "handslotr"
      const hand = (char.root.getObjectByName('handslotr') ?? char.root.getObjectByName('handslot.r')) as Bone | undefined;
      hand?.add(cup);
    }
    const legs: Actor['legs'] = [];
    char.root.traverse((o) => {
      const bone = o as Bone;
      if (!bone.isBone) return;
      if (/^upperleg/.test(o.name)) legs.push({ bone, angle: SIT_THIGH });
      else if (/^lowerleg/.test(o.name)) legs.push({ bone, angle: SIT_SHIN });
    });
    this.scene.add(char.root);
    this.actors.set(id, { char, walk, idle, seat: null, y: 0, yaw: Math.PI, moving: false, path: [], goalKey: '', sit: 0, legs });
  }


  /**
   * Thỉnh thoảng một khách đang ở khách sạn xuống sảnh: đi dạo vài điểm ngẫu nhiên khắp sảnh (kệ sách, cây, cửa sổ...),
   * rồi có thể ngồi uống cà phê (hay ngồi cạnh nhau để trò chuyện) một lúc trước khi về phòng.
   */
  private updateAmbient(
    game: Game,
    dt: number,
    names: Map<string, string>,
    targets: Map<string, { pos: Vector3; yaw: number; seat: number | null }>,
    takenSeats: Set<number>,
  ): void {
    this.clock += dt;
    const busy = new Set<string>();
    for (const w of [...game.queue.waiting, ...(game.queue.current ? [game.queue.current] : [])]) {
      if (w.arrival.reservationCode) busy.add(w.arrival.reservationCode);
    }
    const byId = (id: string) => game.reservations.find((r) => `amb-${r.id}` === id);
    // Người lạ có vai ẩn: ở sảnh đến khi hết giờ hoặc bị xử lý (do game quyết định), không giới hạn số lượng
    const strangers = new Map(game.activeVisitors().map((v) => [`vis-${v.id}`, v]));
    const stopsOf = () => Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({ ...this.nav!.randomPoint(Math.random), yaw: (Math.random() - 0.5) * 2.4, wait: 3 + Math.random() * 6 }));
    if (this.nav) for (const id of strangers.keys()) if (!this.ambient.has(id)) this.ambient.set(id, { stops: stopsOf(), stage: 0, waitUntil: null, seatWanted: true, sitUntil: null });
    for (const [id] of [...this.ambient]) {
      if (id.startsWith('vis-')) {
        if (!strangers.has(id)) this.ambient.delete(id);
        continue;
      }
      const r = byId(id);
      if (!r || r.status !== 'checked_in' || busy.has(r.code) || game.isOver) this.ambient.delete(id); // trả phòng, ra quầy hoặc hết ngày
    }
    if (!game.isOver && this.clock >= this.nextAmbient && this.ambient.size < MAX_AMBIENT && this.nav) {
      const pool = game.reservations.filter((r) => r.status === 'checked_in' && !busy.has(r.code) && !this.ambient.has(`amb-${r.id}`));
      if (pool.length > 0) {
        const r = pool[Math.floor(Math.random() * pool.length)]!;
        const stops = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({ ...this.nav!.randomPoint(Math.random), yaw: (Math.random() - 0.5) * 2.4, wait: 3 + Math.random() * 6 }));
        this.ambient.set(`amb-${r.id}`, { stops, stage: 0, waitUntil: null, seatWanted: Math.random() < 0.75, sitUntil: null });
      }
      this.nextAmbient = this.clock + 14 + Math.random() * 14;
    }

    const seatOf = new Map<string, number>();
    for (const [id, st] of [...this.ambient]) {
      const stranger = strangers.get(id);
      names.set(id, stranger ? stranger.name : byId(id)!.guestName);
      const actor = this.actors.get(id);
      if (st.stage < st.stops.length) {
        // Đang đi dạo: tới điểm thì đứng nhìn quanh một lúc rồi sang điểm kế
        const stop = st.stops[st.stage]!;
        const pos = new Vector3(stop.x, 0, stop.z);
        if (actor && actor.path.length === 0 && actor.goalKey === goalKeyOf(pos)) {
          if (st.waitUntil === null) st.waitUntil = this.clock + stop.wait;
          else if (this.clock >= st.waitUntil) {
            st.stage += 1;
            st.waitUntil = null;
          }
        }
        targets.set(id, { pos, yaw: stop.yaw, seat: null });
        continue;
      }
      if (!st.seatWanted) {
        this.ambient.delete(id); // dạo xong thì về phòng
        continue;
      }
      // Ngồi: chọn ghế ngẫu nhiên, đôi khi ngồi cạnh khách khác để nói chuyện
      let seat = actor?.seat ?? null;
      if (seat != null && takenSeats.has(seat)) seat = null;
      if (seat == null) {
        const free = SEATS.map((_, i) => i).filter((i) => !takenSeats.has(i));
        const mates = free.filter((i) => SEAT_PAIR[i] !== undefined && takenSeats.has(SEAT_PAIR[i]!));
        const choices = mates.length > 0 && Math.random() < 0.6 ? mates : free;
        seat = choices[Math.floor(Math.random() * choices.length)] ?? null;
      }
      if (seat == null) {
        if (stranger && this.nav) Object.assign(st, { stops: stopsOf(), stage: 0, waitUntil: null }); // người lạ chưa có ghế thì đi dạo tiếp
        else this.ambient.delete(id); // hết ghế: về phòng
        continue;
      }
      takenSeats.add(seat);
      seatOf.set(id, seat);
      if (actor && actor.sit > 0.95 && !stranger) {
        if (st.sitUntil === null) st.sitUntil = this.clock + 40 + Math.random() * 40;
        else if (this.clock >= st.sitUntil) this.ambient.delete(id);
      }
    }
    for (const [id, seat] of seatOf) {
      const [x, z, yaw0] = SEATS[seat]!;
      const mate = SEAT_PAIR[seat];
      const talking = mate !== undefined && [...seatOf.values()].includes(mate);
      const lean = talking ? (x < SEATS[mate!]![0] ? 0.5 : -0.5) : 0;
      targets.set(id, { pos: new Vector3(x, 0, z), yaw: yaw0 + lean, seat });
    }
  }

  /** Cập nhật khách theo trạng thái game; dt là giây (đã nhân tốc độ, 0 khi tạm dừng). */
  update(game: Game | null, dt: number): void {
    if (game !== this.game) {
      this.clear();
      this.game = game;
    }
    if (!game) return;

    // Vị trí đích theo từng khách đang có trong game
    const targets = new Map<string, { pos: Vector3; yaw: number; seat: number | null }>();
    const names = new Map<string, string>();
    const takenSeats = new Set<number>();
    const cur = game.queue.current;
    game.queue.waiting.forEach((w, i) => {
      const a = this.actors.get(w.arrival.id);
      if (i >= LINE_SLOTS && a?.seat != null) takenSeats.add(a.seat);
    });
    if (cur) {
      targets.set(cur.arrival.id, { pos: COUNTER.clone(), yaw: 0, seat: null });
      names.set(cur.arrival.id, cur.arrival.guestName);
    }
    let overflow = 0;
    game.queue.waiting.forEach((w, i) => {
      names.set(w.arrival.id, w.arrival.guestName);
      if (i < LINE_SLOTS) {
        targets.set(w.arrival.id, { pos: new Vector3(LINE_X[i]!, 0, -3.3 - i * 1.2), yaw: 0, seat: null });
        return;
      }
      const actor = this.actors.get(w.arrival.id);
      let seat = actor?.seat ?? null;
      if (seat == null) {
        seat = SEATS.findIndex((_, s) => !takenSeats.has(s));
        if (seat < 0) seat = null;
        else takenSeats.add(seat);
      }
      if (seat != null) {
        const [x, z, yaw] = SEATS[seat]!;
        targets.set(w.arrival.id, { pos: new Vector3(x, 0, z), yaw, seat });
      } else {
        const [x, z] = OVERFLOW[overflow++ % OVERFLOW.length]!;
        targets.set(w.arrival.id, { pos: new Vector3(x, 0, z), yaw: 0, seat: null });
      }
    });

    this.updateAmbient(game, dt, names, targets, takenSeats);
    const mugIds = this.ambient;
    for (const [id, name] of names) if (!this.actors.has(id) && !this.loading.has(id)) void this.spawn(id, name, mugIds.has(id));

    let nearDoor = false;
    for (const [id, a] of [...this.actors]) {
      const t = targets.get(id);
      a.seat = t?.seat ?? null;
      const root = a.char.root;
      const here = { x: root.position.x, z: root.position.z };

      // Đổi đích thì tìm đường mới (đi vòng đồ đạc); ghế thì tới điểm đứng trước ghế rồi mới bước vào ngồi
      const key = t ? (t.seat != null ? `seat${t.seat}` : goalKeyOf(t.pos)) : 'door';
      if (key !== a.goalKey) {
        a.goalKey = key;
        if (!t) a.path = [...this.routeFrom(here, DOOR), OUTSIDE];
        else if (t.seat != null) {
          const [sx, sz, syaw] = SEATS[t.seat]!;
          a.path = [...this.routeFrom(here, { x: sx + Math.sin(syaw) * 1.1, z: sz + Math.cos(syaw) * 1.1 }), { x: sx, z: sz }];
        } else a.path = this.routeFrom(here, { x: t.pos.x, z: t.pos.z });
      }

      let dist = 0;
      const next = a.path[0];
      if (next) {
        const dx = next.x - here.x;
        const dz = next.z - here.z;
        dist = Math.hypot(dx, dz);
        if (dist <= 0.06) {
          a.path.shift();
          dist = 0;
        } else if (dt > 0) {
          const k = Math.min(1, (WALK_SPEED * dt) / dist);
          root.position.x += dx * k;
          root.position.z += dz * k;
          a.yaw = turn(a.yaw, Math.atan2(dx, dz), 10 * dt);
        }
      }
      a.moving = a.path.length > 0 && dt > 0;
      if (a.path.length === 0 && t) a.yaw = turn(a.yaw, t.yaw, 8 * dt);

      const sitting = a.path.length === 0 && t?.seat != null;
      a.sit = MathUtils.lerp(a.sit, sitting ? 1 : 0, Math.min(1, 8 * Math.max(dt, 0.016)));
      a.y = -SIT_DROP * a.sit;
      root.position.y = a.y;
      root.rotation.y = a.yaw;
      const w = a.moving ? 1 : 0;
      a.walk.setEffectiveWeight(MathUtils.lerp(a.walk.getEffectiveWeight(), w, Math.min(1, 12 * dt)));
      a.idle.setEffectiveWeight(1 - a.walk.getEffectiveWeight());
      a.char.mixer.update(dt);
      if (a.sit > 0.01) for (const l of a.legs) l.bone.rotateX(l.angle * a.sit); // dáng ngồi: gập đùi ra trước, cẳng chân rủ xuống
      if (Math.hypot(root.position.x - DOOR.x, root.position.z - DOOR_PLANE_Z) < 2.8) nearDoor = true;
      if (!t && a.path.length === 0) {
        this.scene.remove(root);
        this.actors.delete(id);
      }
    }
    this.doorOpen = MathUtils.lerp(this.doorOpen, nearDoor ? 1 : 0, Math.min(1, 6 * Math.max(dt, 0.016)));
    this.door.setOpen(this.doorOpen);
  }

  /** Đường đi; khách đang ở ngoài cửa thì phải đi qua cửa trước. */
  private routeFrom(here: Pt, goal: Pt): Pt[] {
    if (here.z < -9.7) return [{ x: DOOR.x, z: DOOR.z }, ...this.route({ x: DOOR.x, z: DOOR.z }, goal)];
    return this.route(here, goal);
  }

  /**
   * Người được bấm trên màn hình (x, y là pixel trong canvas cỡ w × h): so điểm bấm với khung
   * từ chân tới đầu của từng người, chọn người gần camera nhất.
   */
  pick(x: number, y: number, camera: Camera, w: number, h: number): string | null {
    let best: { id: string; depth: number } | null = null;
    for (const [id, a] of this.actors) {
      const feet = this.toScreen(a, 0, camera, w, h);
      const head = this.toScreen(a, HEIGHT + 0.15, camera, w, h);
      const half = Math.max(14, (feet.y - head.y) * 0.32);
      if (x < head.x - half || x > head.x + half || y < head.y || y > feet.y) continue;
      if (!best || feet.depth < best.depth) best = { id, depth: feet.depth };
    }
    return best?.id ?? null;
  }

  /** Điểm trên đầu một người theo pixel, để đặt bong bóng thoại; null nếu người đó đã đi. */
  headScreen(id: string, camera: Camera, w: number, h: number): { x: number; y: number } | null {
    const a = this.actors.get(id);
    return a ? this.toScreen(a, HEIGHT + 0.25 - SIT_DROP * a.sit, camera, w, h) : null;
  }

  /** Mời một khách đang ngồi chơi ở sảnh về phòng. Trả false nếu đó không phải khách ngồi chơi. */
  shooAmbient(id: string): boolean {
    if (!this.ambient.delete(id)) return false;
    this.nextAmbient = Math.max(this.nextAmbient, this.clock + 20);
    return true;
  }

  private toScreen(a: Actor, height: number, camera: Camera, w: number, h: number): { x: number; y: number; depth: number } {
    const p = a.char.root.position;
    const v = new Vector3(p.x, a.y + height, p.z).project(camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, depth: v.z };
  }

  /** Vị trí hiện tại của khách (dùng cho kiểm thử tự động). */
  debugPositions(): Array<{ id: string; x: number; z: number; sitting: boolean }> {
    return [...this.actors].map(([id, a]) => ({ id, x: a.char.root.position.x, z: a.char.root.position.z, sitting: a.sit > 0.01 || a.path.length === 1 }));
  }

  private route(from: Pt, to: Pt): Pt[] {
    return this.nav ? this.nav.findPath(from, to, true) : [to];
  }
}

/** Xoay dần góc hiện tại về góc đích theo đường ngắn nhất. */
function turn(from: number, to: number, t: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * Math.min(1, t);
}
