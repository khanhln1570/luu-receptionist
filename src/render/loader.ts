import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Group } from 'three';
import type { Pack } from './lobbyLayout';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Group>>();

export function modelUrl(pack: Pack, model: string): string {
  return `${import.meta.env.BASE_URL}assets/${pack}/${model}.gltf`;
}

/** Tải model (có cache) và trả về một bản clone mới để đặt vào cảnh. */
export async function loadModel(pack: Pack, model: string): Promise<Group> {
  const url = modelUrl(pack, model);
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => gltf.scene);
    cache.set(url, p);
  }
  const scene = await p;
  return scene.clone(true);
}
