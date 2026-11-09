import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { LOOKS, POSES, RECEPTIONIST, type Pose } from '../src/data/looks';
import { createCharacter, loadClips } from '../src/render/characters';

const SIZE = 256;
/** Khách và lễ tân (lễ tân chỉ xuất avatar cận mặt, xem export-portraits.mjs). */
const ALL = [...LOOKS, RECEPTIONIST];
const CLIP: Record<Pose, { name: string; t: number }> = {
  'binh-thuong': { name: 'Idle_A', t: 0.3 },
  hoi: { name: 'Interact', t: 0.6 },
  buc: { name: 'Hit_B', t: 0.25 },
};

const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setClearColor(0x000000, 0);
const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 1.4));
const key = new DirectionalLight(0xffffff, 2.2);
key.position.set(2, 3, 4);
scene.add(key);
const camera = new PerspectiveCamera(22, 1, 0.1, 50);

/** face = cận mặt chính diện (dùng cho avatar lễ tân), mặc định là nửa người như portrait khách. */
async function render(lookId: string, pose: Pose, frame: 'bust' | 'face' = 'bust'): Promise<string> {
  const look = ALL.find((l) => l.id === lookId)!;
  const { root, mixer, head, headHeight: h } = await createCharacter(look);
  const clips = await loadClips();
  mixer.stopAllAction();
  mixer.clipAction(clips.get(CLIP[pose].name)!).play();
  mixer.setTime(CLIP[pose].t);
  scene.add(root);
  root.updateMatrixWorld(true);
  const focus = head.clone().add(new Vector3(0, h * (frame === 'face' ? 0.25 : 0.1), 0));
  camera.position.set(focus.x, focus.y + (frame === 'face' ? 0 : h * 0.1), focus.z + h * (frame === 'face' ? 2.6 : 5.4));
  camera.lookAt(focus);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(root);
  return url;
}

(window as unknown as { portrait: unknown }).portrait = { looks: LOOKS.map((l) => l.id), poses: POSES, render };

const grid = document.getElementById('grid')!;
(async () => {
  for (const l of LOOKS) {
    for (const p of POSES) {
      const fig = document.createElement('figure');
      const img = new Image();
      img.src = await render(l.id, p);
      const cap = document.createElement('figcaption');
      cap.textContent = `${l.id} · ${p}`;
      fig.append(img, cap);
      grid.append(fig);
    }
  }
  document.title = 'ready';
})();
