import {
  AnimationMixer,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  type AnimationClip,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HIDDEN_PARTS, PALETTE_CELLS, type Look, type Role } from '../data/looks';

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<{ scene: Group; animations: AnimationClip[] }>>();
const load = (file: string) => {
  let p = gltfCache.get(file);
  if (!p) gltfCache.set(file, (p = loader.loadAsync(`${import.meta.env.BASE_URL}assets/characters/${file}.glb`)));
  return p;
};

/** Tất cả animation dùng chung rig Medium (Idle_A, Interact, Hit_B, Walking_A, ...). */
export async function loadClips(): Promise<Map<string, AnimationClip>> {
  const packs = await Promise.all([load('Rig_Medium_General'), load('Rig_Medium_MovementBasic')]);
  return new Map(packs.flatMap((p) => p.animations).map((c) => [c.name, c]));
}

/** Đổi màu các ô trên bảng màu nhưng giữ độ sáng tối (gradient) của ô. */
function recolor(image: CanvasImageSource, look: Look): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, 1024, 1024);
  const cells = PALETTE_CELLS[look.model];
  const colorOf: Record<Role, string | undefined> = {
    skin: look.skin,
    hair: look.hair,
    shirt: look.shirt,
    pants: look.pants,
    accent: look.accent,
    bracer: look.skin,
    trim: look.pants ?? look.shirt,
    shoes: look.shoes ?? '#f2f2f2',
  };
  for (const role of Object.keys(colorOf) as Role[]) {
    const color = colorOf[role];
    if (!color) continue;
    const target = new Color(color).convertSRGBToLinear();
    for (const cell of cells[role] ?? []) {
      const [r, c] = cell.split(',').map(Number) as [number, number];
      const img = ctx.getImageData(c * 128, r * 128, 128, 128);
      const d = img.data;
      let mean = 0;
      for (let i = 0; i < d.length; i += 4) mean += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      mean /= d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const f = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / mean;
        const lin = (v: number) => Math.min(255, Math.round(Math.pow(Math.min(1, Math.max(0, v * f)), 1 / 2.2) * 255));
        d[i] = lin(target.r);
        d[i + 1] = lin(target.g);
        d[i + 2] = lin(target.b);
      }
      ctx.putImageData(img, c * 128, r * 128);
    }
  }
  return cv;
}

const materials = new Map<string, MeshStandardMaterial>();
async function materialFor(look: Look): Promise<MeshStandardMaterial> {
  let m = materials.get(look.id);
  if (!m) {
    const src = await load(look.model);
    const skinned = src.scene.getObjectByProperty('isSkinnedMesh', true) as SkinnedMesh;
    const map = new CanvasTexture(recolor((skinned.material as MeshStandardMaterial).map!.image as CanvasImageSource, look));
    map.flipY = false;
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    m = new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
    materials.set(look.id, m);
  }
  return m;
}

function accessory(kind: string, head: Vector3, h: number): Object3D {
  const g = new Group();
  const mat = (c: string) => new MeshStandardMaterial({ color: c, roughness: 0.8 });
  if (kind === 'sunhat') {
    const brim = new Mesh(new CylinderGeometry(h * 0.78, h * 0.78, h * 0.05, 24), mat('#f1d38a'));
    brim.position.set(0, h * 0.6, 0);
    const crown = new Mesh(new CylinderGeometry(h * 0.42, h * 0.46, h * 0.28, 24), mat('#f1d38a'));
    crown.position.set(0, h * 0.74, 0);
    const band = new Mesh(new CylinderGeometry(h * 0.47, h * 0.47, h * 0.07, 24), mat('#d6453d'));
    band.position.set(0, h * 0.64, 0);
    g.add(brim, crown, band);
  } else if (kind === 'shades') {
    const frame = new MeshStandardMaterial({ color: '#15171c', roughness: 0.4 });
    const glass = new MeshStandardMaterial({ color: '#1d2a44', roughness: 0.15, metalness: 0.6 });
    const y = h * 0.27;
    const z = h * 0.5;
    for (const side of [-1, 1]) {
      const rim = new Mesh(new CylinderGeometry(h * 0.15, h * 0.15, h * 0.05, 24), frame);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(side * h * 0.19, y, z);
      const lens = new Mesh(new CylinderGeometry(h * 0.125, h * 0.125, h * 0.06, 24), glass);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(side * h * 0.19, y, z + h * 0.01);
      const arm = new Mesh(new BoxGeometry(h * 0.04, h * 0.04, h * 0.5), frame);
      arm.position.set(side * h * 0.36, y, z - h * 0.24);
      g.add(rim, lens, arm);
    }
    const bridge = new Mesh(new BoxGeometry(h * 0.1, h * 0.04, h * 0.05), frame);
    bridge.position.set(0, y + h * 0.03, z);
    g.add(bridge);
  } else if (kind === 'camera') {
    const cam = new Mesh(new BoxGeometry(h * 0.34, h * 0.22, h * 0.16), mat('#23262d'));
    cam.position.set(0, -h * 0.55, h * 0.45);
    const lens = new Mesh(new CylinderGeometry(h * 0.07, h * 0.07, h * 0.1, 16), mat('#8892a0'));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -h * 0.55, h * 0.58);
    g.add(cam, lens);
  }
  g.position.copy(head);
  return g;
}

export interface Character {
  root: Group;
  mixer: AnimationMixer;
  head: Vector3; // vị trí xương đầu (hệ tọa độ thế giới lúc dựng, root ở gốc)
  headHeight: number;
}

/** Dựng nhân vật theo ngoại hình: đổi màu, ẩn đồ phiêu lưu, gắn phụ kiện vào xương đầu/ngực. */
export async function createCharacter(look: Look): Promise<Character> {
  const src = await load(look.model);
  const clips = await loadClips();
  const root = clone(src.scene) as Group;
  const material = await materialFor(look);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.material = material;
    m.castShadow = true;
    if (HIDDEN_PARTS.some((p) => o.name.endsWith(`_${p}`))) o.visible = false;
  });
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clips.get('Idle_A')!).play();
  mixer.setTime(0.3);
  root.updateMatrixWorld(true);
  const bone = root.getObjectByName('head') as Bone;
  const head = bone.getWorldPosition(new Vector3());
  const headMesh = root.getObjectByName(`${look.model}_Head`) as SkinnedMesh;
  headMesh.geometry.computeBoundingBox();
  const headHeight = headMesh.geometry.boundingBox!.getSize(new Vector3()).y;
  for (const k of look.accessories ?? []) {
    const a = accessory(k, head, headHeight);
    root.add(a);
    (k === 'camera' ? (root.getObjectByName('chest') as Bone) : bone).attach(a); // máy ảnh đeo ngực; giữ nguyên vị trí thế giới nhưng đi theo xương khi animation chạy
  }
  return { root, mixer, head, headHeight };
}

export function clipFor(clips: Map<string, AnimationClip>, name: string): AnimationClip {
  return clips.get(name)!;
}
