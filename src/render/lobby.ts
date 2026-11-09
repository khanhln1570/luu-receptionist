import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  TorusGeometry,
  type Scene,
} from 'three';
import { Box3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { KIT, bulbString, blob, cyl, lantern, leverHandle, mat, palm, rbox, topiary, wreath } from './kit';
import { loadModel } from './loader';
import type { Rect } from './navigation';
import { LOBBY_LAYOUTS, ROOM, type LobbyTheme } from './lobbyLayout';

interface Palette {
  wall: number;
  sideWall: number;
  wainscot: number;
  rail: number; // thanh gờ trên ốp chân tường
  door: number;
  trim: number; // khung cửa, viền biển
  signBg: string;
  signFg: string;
  signTitle: string;
  light: number; // màu đèn điểm
}

const PALETTES: Record<LobbyTheme, Palette> = {
  homestay: { wall: 0xf4e4c8, sideWall: 0xeed9b8, wainscot: 0x8d5f3c, rail: 0x5f3d22, door: 0x5b3a29, trim: 0x6b4427, signBg: '#6b4427', signFg: '#fbe9c6', signTitle: 'Homestay Raon', light: 0xffc27a },
  hotel: { wall: 0xf2ece0, sideWall: 0xece4d4, wainscot: 0x6e2b34, rail: 0xc9a24a, door: 0x4a2a22, trim: 0xc9a24a, signBg: '#2b1a1d', signFg: '#f3d98b', signTitle: 'Golden Bay', light: 0xffd9a0 },
  resort: { wall: 0xfbf6ec, sideWall: 0xf6efe0, wainscot: 0xc9a06a, rail: 0x8a6a3e, door: 0x8a6238, trim: 0x8a6a3e, signBg: '#1f6f78', signFg: '#fff6e0', signTitle: 'ANIA Resort Villa', light: 0xfff0d0 },
};

/** Khối tường/khung bo cạnh kiểu KayKit; không đổ bóng để tường không che nắng vào sảnh. */
function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): Mesh {
  const m = rbox(w, h, d, color, x, y, z);
  m.castShadow = false;
  return m;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Biển hiệu: dòng trên là loại hình, dòng dưới là câu chào. */
function buildSign(p: Palette): Group {
  const tex = canvasTexture(512, 160, (ctx) => {
    ctx.fillStyle = p.signBg;
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = p.signFg;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.signFg;
    ctx.textAlign = 'center';
    let size = 58;
    do ctx.font = `bold ${size--}px sans-serif`;
    while (ctx.measureText(p.signTitle).width > 470 && size > 24); // tên dài thì thu nhỏ chữ cho vừa biển
    ctx.fillText(p.signTitle, 256, 80);
    ctx.font = '34px sans-serif';
    ctx.fillText('Chào mừng bạn!', 256, 126);
  });
  const g = new Group();
  g.add(rbox(3.0, 1.05, 0.12, KIT.woodDark, 0, 4.56, ROOM.farZ + 0.08));
  const m = new Mesh(new PlaneGeometry(2.8, 0.875), new MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.position.set(0, 4.56, ROOM.farZ + 0.145);
  g.add(m);
  for (const x of [-1.2, 1.2]) g.add(cyl(0.05, 0.05, 0.03, KIT.gold, x, 4.98, ROOM.farZ + 0.15, 8).rotateX(Math.PI / 2));
  return g;
}

/** Cửa sổ trên tường bên: khung dày bo cạnh, bậu cửa, song chữ thập, rèm xếp nếp và thanh treo rèm. side = -1 (trái) hoặc 1 (phải). */
function buildWindow(side: -1 | 1, z: number, curtain: number): Group {
  const g = new Group();
  const x = side * (ROOM.halfWidth - 0.05);
  const inward = -side;
  const fx = x + inward * 0.06;
  g.add(new Mesh(new BoxGeometry(0.02, 1.9, 2.3), mat(0xdff0ff, { glow: 0xbfe0ff, glowIntensity: 0.55 })).translateX(x).translateY(2.5).translateZ(z));
  // Khung: bốn thanh viền và song chữ thập nằm trước kính
  g.add(box(0.12, 0.16, 2.6, KIT.woodDark, fx, 3.53, z), box(0.12, 0.16, 2.6, KIT.woodDark, fx, 1.47, z));
  g.add(box(0.12, 2.2, 0.16, KIT.woodDark, fx, 2.5, z - 1.22), box(0.12, 2.2, 0.16, KIT.woodDark, fx, 2.5, z + 1.22));
  g.add(box(0.08, 1.9, 0.08, KIT.woodDark, fx, 2.5, z), box(0.08, 0.08, 2.3, KIT.woodDark, fx, 2.5, z));
  g.add(box(0.36, 0.1, 2.9, KIT.wood, x + inward * 0.14, 1.36, z)); // bậu cửa
  g.add(cyl(0.035, 0.035, 3.6, KIT.woodDark, x + inward * 0.22, 3.72, z).rotateX(Math.PI / 2)); // thanh treo rèm
  for (const k of [-1, 1]) {
    for (let f = 0; f < 3; f++) {
      const fold = rbox(0.12, 2.3, 0.24, f % 2 ? curtain : new Color(curtain).multiplyScalar(0.85).getHex());
      fold.position.set(x + inward * (0.22 + (f % 2) * 0.05), 2.55, z + k * (1.45 + f * 0.2));
      g.add(fold);
    }
  }
  return g;
}
/** Dây đèn bóng tròn treo võng dọc tường xa và hai tường bên. */
function buildStringLights(): Group {
  const g = new Group();
  const swag = (x0: number, z0: number, x1: number, z1: number, loops: number) => {
    const pts: Vector3[] = [];
    for (let i = 0; i <= loops * 6; i++) {
      const t = i / (loops * 6);
      pts.push(new Vector3(x0 + (x1 - x0) * t, 4.4 - Math.sin(Math.PI * ((i % 6) / 6)) * 0.22, z0 + (z1 - z0) * t));
    }
    g.add(bulbString(pts, 0.5, 0xffc457));
  };
  swag(-7.7, ROOM.farZ + 0.15, 7.7, ROOM.farZ + 0.15, 6);
  swag(-7.8, ROOM.farZ + 0.3, -7.8, 2, 5);
  swag(7.8, ROOM.farZ + 0.3, 7.8, 2, 5);
  return g;
}
/** Cây cảnh kiểu KayKit: `palm` cây cọ thân đốt, `ficus` bụi tròn cắt tỉa trong chậu đất nung. */
function buildPlant(kind: 'palm' | 'ficus', x: number, z: number, scale = 1): Group {
  const g = kind === 'palm' ? palm(scale * 1.05) : topiary(scale * 1.25, true);
  g.position.set(x, 0, z);
  return g;
}
/** Đèn chùm: vòng đồng dày, nến trắng với bóng lửa, treo bằng ba dây. */
function chandelier(x: number, z: number): Group {
  const g = new Group();
  const gold = mat(KIT.gold);
  g.add(cyl(0.03, 0.03, 1.2, gold, 0, 0.75, 0, 6));
  g.add(new Mesh(new TorusGeometry(0.55, 0.06, 6, 20), gold).rotateX(Math.PI / 2));
  g.add(cyl(0.16, 0.08, 0.22, gold, 0, -0.05, 0, 8));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cx = Math.cos(a) * 0.55;
    const cz = Math.sin(a) * 0.55;
    g.add(cyl(0.07, 0.07, 0.04, gold, cx, 0.05, cz, 8));
    g.add(cyl(0.035, 0.035, 0.18, 0xfbf3e2, cx, 0.16, cz, 8));
    g.add(blob(0.05, mat(0xfff3d1, { glow: KIT.glow, glowIntensity: 2 }), cx, 0.29, cz, 0));
  }
  g.position.set(x, 3.7, z);
  return g;
}
/** Đèn thả: chao hình chuông vải, bóng sáng lộ dưới chao. */
function pendant(x: number, z: number): Group {
  const g = new Group();
  g.add(cyl(0.015, 0.015, 1.2, 0x6b4a2b, 0, 0.75, 0, 6));
  g.add(cyl(0.06, 0.06, 0.08, KIT.wood, 0, 0.14, 0, 8));
  g.add(cyl(0.12, 0.36, 0.3, mat(0xf3e2bd, { glow: 0xffd9a0, glowIntensity: 0.7 }), 0, 0, 0, 10));
  g.add(blob(0.1, mat(0xfff3d1, { glow: KIT.glow, glowIntensity: 2 }), 0, -0.12, 0, 1));
  g.position.set(x, 3.6, z);
  return g;
}
/** Mặt quầy bằng đá/gỗ phủ lên ba bàn, cộng chuông bàn. */
function buildCounterTop(color: number, bellColor: number): Group {
  const g = new Group();
  g.add(rbox(9.6, 0.1, 1.35, color, 0, 1.02, 1.5));
  g.add(deskBell(bellColor, -0.6, 1.07, 1.2));
  return g;
}

/** Chuông quầy: đế tròn, vòm chuông, núm bấm. */
function deskBell(color: number, x: number, y: number, z: number): Group {
  const g = new Group();
  g.add(cyl(0.2, 0.22, 0.04, KIT.woodDark, 0, 0.02, 0, 14));
  const dome = new Mesh(new SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
  dome.position.y = 0.04;
  g.add(dome, cyl(0.015, 0.015, 0.06, color, 0, 0.22, 0, 6), blob(0.035, color, 0, 0.26, 0, 1));
  g.position.set(x, y, z);
  return g;
}
function buildFloor(theme: LobbyTheme): Group {
  const g = new Group();
  const depth = ROOM.nearZ - ROOM.farZ;
  const midZ = (ROOM.nearZ + ROOM.farZ) / 2;
  const w = ROOM.halfWidth * 2;
  if (theme === 'homestay') {
    const strips = 16;
    for (let i = 0; i < strips; i++) {
      g.add(box(w / strips, 0.2, depth, i % 2 ? 0xb88b5e : 0xc29567, -ROOM.halfWidth + (i + 0.5) * (w / strips), -0.1, midZ));
    }
    return g;
  }
  const [c1, c2] = theme === 'hotel' ? ['#ece6da', '#cfc5b3'] : ['#f1e5cc', '#e4d2b0'];
  const tex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = c2;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillRect(128, 128, 128, 128);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(w / 2, depth / 2);
  const floor = new Mesh(new BoxGeometry(w, 0.2, depth), new MeshStandardMaterial({ map: tex, roughness: theme === 'hotel' ? 0.35 : 0.7 }));
  floor.position.set(0, -0.1, midZ);
  floor.receiveShadow = true;
  g.add(floor);
  return g;
}

/** Hai ô cửa kính lớn nhìn ra biển hai bên cửa chính (resort). */
function buildPanorama(): Group {
  const g = new Group();
  const tex = canvasTexture(1024, 320, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#7cc8ee');
    sky.addColorStop(1, '#d9f1ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 320);
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(760, 90, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2aa9c9';
    ctx.fillRect(0, 170, 1024, 90);
    ctx.fillStyle = '#7fd3e6';
    for (let i = 0; i < 18; i++) ctx.fillRect(30 + i * 56, 190 + (i % 3) * 22, 36, 4);
    ctx.fillStyle = '#efd9a4';
    ctx.fillRect(0, 258, 1024, 62);
    ctx.fillStyle = '#2f7a46';
    ctx.fillRect(150, 150, 8, 130);
    for (const a of [-1.1, -0.5, 0.2, 0.8, 1.4]) {
      ctx.beginPath();
      ctx.ellipse(154 + Math.cos(a) * 34, 150 + Math.sin(a) * 10 - 6, 40, 7, a * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  for (const side of [-1, 1]) {
    const cx = side * 4.7;
    const m = new Mesh(new PlaneGeometry(5.2, 2.6), new MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6 }));
    m.position.set(cx, 3.0, ROOM.farZ + 0.02);
    g.add(m);
    g.add(box(5.4, 0.1, 0.12, 0x8a6a3e, cx, 4.32, ROOM.farZ + 0.06));
    g.add(box(5.4, 0.1, 0.12, 0x8a6a3e, cx, 1.68, ROOM.farZ + 0.06));
    for (const dx of [-2.6, 0, 2.6]) g.add(box(0.1, 2.7, 0.12, 0x8a6a3e, cx + dx, 3.0, ROOM.farZ + 0.06));
  }
  return g;
}

const around = (x: number, z: number, r: number): Rect => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });

/** Thảm chân cửa kiểu xơ dừa: viền tối, chữ ở giữa, cạnh bo tròn. */
function doormat(text: string, bg: string, fg: string, w: number, d: number, z: number): Mesh {
  const tex = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(14, 14, 228, 100, 16);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
    ctx.fillText(text, 128, 80);
  });
  const m = new Mesh(new RoundedBoxGeometry(w, 0.05, d, 2, 0.02), new MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.position.set(0, 0.025, z);
  m.receiveShadow = true;
  return m;
}
/** Đèn lồng gắn tường hai bên cửa. */
function wallLamp(x: number, _color: number, glow: number): Group {
  const g = lantern(glow);
  g.scale.setScalar(1.3);
  g.position.set(x, 2.6, ROOM.farZ + 0.02);
  return g;
}
/** Trang trí khu vực cửa ra vào theo kiểu sảnh: thảm, mái hiên, đèn, cây treo. */
function buildEntrance(theme: LobbyTheme): Group {
  const g = new Group();
  const z0 = ROOM.farZ;
  if (theme === 'homestay') {
    g.add(doormat('welcome', '#9a6a3f', '#3a2616', 1.7, 0.9, z0 + 0.75));
    // Mái hiên gỗ nhỏ trên cửa và hai đèn lồng
    g.add(box(3.8, 0.12, 0.7, 0x5f3d22, 0, 4.02, z0 + 0.35));
    for (let i = 0; i < 6; i++) g.add(box(0.1, 0.1, 0.7, 0x4a2f19, -1.75 + i * 0.7, 3.92, z0 + 0.35));
    g.add(wallLamp(-1.95, 0xffd9a0, 0xffb347), wallLamp(1.95, 0xffd9a0, 0xffb347));
    // Chậu cây treo
    for (const x of [-1.2, 1.2]) {
      g.add(cyl(0.012, 0.012, 0.55, KIT.woodDark, x, 3.66, z0 + 0.5, 4));
      const hang = topiary(0.6);
      hang.position.set(x, 3.15, z0 + 0.5);
      g.add(hang);
    }
  } else if (theme === 'hotel') {
    // Thảm đỏ viền vàng từ cửa vào trong
    g.add(box(1.7, 0.03, 4.4, 0xc9a24a, 0, 0.015, z0 + 2.45));
    g.add(box(1.4, 0.04, 4.4, 0x8e1f2f, 0, 0.02, z0 + 2.45));
    g.add(doormat('welcome', '#2b1a1d', '#f3d98b', 1.7, 0.9, z0 + 0.6));
    // Mái che mạ vàng và đèn tường
    g.add(box(4.2, 0.2, 0.9, 0xc9a24a, 0, 4.1, z0 + 0.45));
    g.add(box(4.0, 0.12, 0.8, 0x6e2b34, 0, 3.93, z0 + 0.45));
    g.add(wallLamp(-2.0, 0xfff1c9, 0xffd27a), wallLamp(2.0, 0xfff1c9, 0xffd27a));
    // Cột cổng đá hai bên cửa
    for (const x of [-1.75, 1.75]) {
      g.add(box(0.3, 4, 0.3, 0xf4eee0, x, 2, z0 + 0.2));
      g.add(box(0.4, 0.16, 0.4, 0xc9a24a, x, 0.08, z0 + 0.2));
      g.add(box(0.4, 0.16, 0.4, 0xc9a24a, x, 4.0, z0 + 0.2));
    }
  } else {
    g.add(doormat('Aloha', '#1f6f78', '#fff6e0', 1.9, 1.0, z0 + 0.8));
    // Mái hiên tre
    g.add(box(4.2, 0.1, 0.9, 0x8a6a3e, 0, 4.05, z0 + 0.45));
    for (let i = 0; i < 9; i++) g.add(box(0.06, 0.06, 0.9, 0xc9a06a, -1.9 + i * 0.475, 3.97, z0 + 0.45));
    g.add(wallLamp(-2.0, 0xf3e2bd, 0xffe3a0), wallLamp(2.0, 0xf3e2bd, 0xffe3a0));
    // Vòng hoa và dải cờ nhỏ màu sắc trên cửa
    const pts = Array.from({ length: 9 }, (_, i) => new Vector3(-1.7 + i * 0.425, 3.82 - Math.sin((i / 8) * Math.PI) * 0.18, z0 + 0.75));
    g.add(bulbString(pts, 0.38, 0xffe3a0));
  }
  return g;
}

function buildShell(theme: LobbyTheme, obstacles: Rect[]): Group {
  const p = PALETTES[theme];
  const g = new Group();
  const depth = ROOM.nearZ - ROOM.farZ;
  const midZ = (ROOM.nearZ + ROOM.farZ) / 2;
  const w = ROOM.halfWidth * 2;
  g.add(buildFloor(theme));
  // Tường sau có ô cửa (rộng DOOR_W, cao DOOR_H) để khách đi từ ngoài vào
  const side = (w - DOOR_W) / 2;
  const sx = DOOR_W / 2 + side / 2;
  for (const x of [-sx, sx]) g.add(box(side, ROOM.height, 0.3, p.wall, x, ROOM.height / 2, ROOM.farZ - 0.15));
  g.add(box(DOOR_W, ROOM.height - DOOR_H, 0.3, p.wall, 0, (ROOM.height + DOOR_H) / 2, ROOM.farZ - 0.15));
  g.add(box(0.3, ROOM.height, depth, p.sideWall, -ROOM.halfWidth - 0.15, ROOM.height / 2, midZ));
  g.add(box(0.3, ROOM.height, depth, p.sideWall, ROOM.halfWidth + 0.15, ROOM.height / 2, midZ));
  // Ốp chân tường và thanh gờ (chừa ô cửa)
  for (const x of [-sx, sx]) {
    g.add(box(side, 1.3, 0.12, p.wainscot, x, 0.65, ROOM.farZ + 0.04));
    g.add(box(side, 0.1, 0.16, p.rail, x, 1.33, ROOM.farZ + 0.05));
  }
  g.add(box(0.12, 1.3, depth, p.wainscot, -ROOM.halfWidth + 0.04, 0.65, midZ));
  g.add(box(0.12, 1.3, depth, p.wainscot, ROOM.halfWidth - 0.04, 0.65, midZ));
  g.add(box(0.16, 0.1, depth, p.rail, -ROOM.halfWidth + 0.05, 1.33, midZ));
  g.add(box(0.16, 0.1, depth, p.rail, ROOM.halfWidth - 0.05, 1.33, midZ));
  g.add(buildDoorway(theme));
  g.add(buildSign(p));
  g.add(buildEntrance(theme));

  if (theme === 'homestay') {
    g.add(buildWindow(-1, -4, 0xc9704a), buildWindow(1, -4, 0xc9704a), buildStringLights());
    g.add(deskBell(KIT.gold, -0.6, 1.0, 1.2));
  } else if (theme === 'hotel') {
    g.add(buildCounterTop(0xefe9dd, 0xd9b44a));
    // Cột ốp đá ở hai bên và đèn chùm
    for (const x of [-6.6, 6.6]) for (const z of [-2.6, -9.2]) {
      obstacles.push(around(x, z, 0.4));
      g.add(box(0.6, 5, 0.6, 0xf4eee0, x, 2.5, z));
      g.add(box(0.8, 0.22, 0.8, 0xf4eee0, x, 0.11, z), box(0.7, 0.1, 0.7, KIT.gold, x, 0.27, z));
      g.add(box(0.8, 0.22, 0.8, 0xf4eee0, x, 4.3, z), box(0.7, 0.1, 0.7, KIT.gold, x, 4.14, z));
    }
    for (const [x, z] of [[0, -4.5], [-4.5, -5.5], [4.5, -5.5]] as const) g.add(chandelier(x, z));
    for (const [x, z] of [[-6.9, -5.6], [6.9, -5.6], [-1.9, -9.3], [1.9, -9.3]] as const) {
      obstacles.push(around(x, z, 0.45));
      g.add(buildPlant('ficus', x, z, x === -1.9 || x === 1.9 ? 1 : 1.1));
    }
  } else {
    g.add(buildPanorama());
    g.add(buildCounterTop(0xe8d3a9, 0x2a9fb0));
    for (const [x, z] of [[-4.5, -4.5], [0, -5], [4.5, -4.5]] as const) g.add(pendant(x, z));
    for (const [x, z, k] of [[-7, -9, 1.3], [7, -9, 1.3], [-7, -3.4, 1], [7, -3.4, 1]] as const) {
      obstacles.push(around(x, z, 0.4));
      g.add(buildPlant('palm', x, z, k));
    }
  }
  return g;
}

const DOOR_W = 2.6;
const DOOR_H = 3.6;
const DOOR_Z = ROOM.farZ - 0.1; // cánh cửa nằm giữa bề dày tường

/** Khung cửa, bậc cửa và cảnh bên ngoài (đường, trời) nhìn thấy khi cửa mở. */
function buildDoorway(theme: LobbyTheme): Group {
  const p = PALETTES[theme];
  const g = new Group();
  const z = ROOM.farZ - 0.15;
  const frame = (w: number, h: number, x: number, y: number) => g.add(box(w, h, 0.34, p.trim, x, y, z));
  frame(0.14, DOOR_H, -DOOR_W / 2 - 0.07, DOOR_H / 2);
  frame(0.14, DOOR_H, DOOR_W / 2 + 0.07, DOOR_H / 2);
  if (theme === 'homestay') {
    // Cửa vòm: lấp hai góc trên bằng màu tường
    const corner = new Shape();
    corner.moveTo(1.3, DOOR_H);
    corner.lineTo(1.3, 2.3);
    corner.absarc(0, 2.3, 1.3, 0, Math.PI / 2, false);
    corner.lineTo(1.3, DOOR_H);
    for (const k of [1, -1]) {
      const m = new Mesh(new ExtrudeGeometry(corner, { depth: 0.34, bevelEnabled: false }), mat(p.wall));
      m.scale.x = k;
      m.position.set(0, 0, ROOM.farZ - 0.32);
      g.add(m);
    }
    const arch = new Mesh(new TorusGeometry(1.36, 0.09, 8, 24, Math.PI), mat(p.trim));
    arch.position.set(0, 2.3, ROOM.farZ + 0.02);
    g.add(arch);
  } else {
    frame(DOOR_W + 0.28, 0.16, 0, DOOR_H + 0.08);
  }
  g.add(box(DOOR_W + 0.4, 0.06, 0.6, 0xb9b2a6, 0, 0.03, ROOM.farZ - 0.1)); // bậc cửa
  // Ngoài trời: lối đi, bãi cỏ và bầu trời (không chịu ánh sáng để luôn sáng)
  const flat = (w: number, h: number, color: number) => new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color }));
  const path = flat(5, 6, 0xcfc3ad);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.005, ROOM.farZ - 3.3);
  const grass = flat(16, 6, 0x7fb06a);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0.002, ROOM.farZ - 3.3);
  const sky = flat(20, 4, theme === 'resort' ? 0x8fd8ee : 0xbfe0f2); // thấp hơn đỉnh tường để chỉ thấy qua ô cửa
  sky.position.set(0, 2, ROOM.farZ - 6.4);
  g.add(grass, path, sky);
  return g;
}

/** Cửa chính: điều khiển bằng setOpen(0..1). Kiểu cửa theo sảnh: homestay cửa vòm gỗ, khách sạn cửa gỗ hai cánh, resort cửa kính trượt. */
export interface DoorRig {
  group: Group;
  setOpen(t: number): void;
}

/** Cánh cửa có gốc ở bản lề (x từ 0 tới w), có ô panô nổi và tay nắm gạt ở mặt trong sảnh (z dương). */
function leaf(w: number, h: number, color: number, panels: boolean, handleSide: 1 | -1, panelShade = 1.3): Group {
  const g = new Group();
  g.add(rbox(w, h, 0.12, color, w / 2, h / 2, 0));
  if (panels) {
    const shade = new Color(color).multiplyScalar(panelShade).getHex();
    const pw = w - 0.36;
    g.add(rbox(pw, 1.55, 0.05, shade, w / 2, h * 0.68, 0.07), rbox(pw, 1.15, 0.05, shade, w / 2, h * 0.22 + 0.2, 0.07));
  }
  const handle = leverHandle(handleSide === 1 ? -1 : 1);
  handle.position.set(handleSide === 1 ? w - 0.18 : 0.18, 1.55, 0.07);
  g.add(handle);
  return g;
}
function buildDoor(theme: LobbyTheme): DoorRig {
  const p = PALETTES[theme];
  const group = new Group();
  group.position.set(0, 0, DOOR_Z);
  const OUT = 1.5; // góc mở ra ngoài (rad)
  if (theme === 'homestay') {
    // Cửa vòm một cánh, mở ra ngoài, bản lề bên trái
    const l = new Group();
    l.position.set(-DOOR_W / 2, 0, 0);
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(DOOR_W, 0);
    shape.lineTo(DOOR_W, 2.3);
    shape.absarc(1.3, 2.3, 1.3, 0, Math.PI, false);
    shape.lineTo(0, 0);
    const body = new Mesh(new ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), mat(p.door));
    body.position.z = -0.04;
    l.add(body);
    const light = new Color(p.door).multiplyScalar(1.35).getHex();
    for (const [bw, bh, bx, by] of [[0.9, 1.1, 0.8, 0.8], [0.9, 1.1, 1.8, 0.8], [1.9, 0.9, 1.3, 2.1]] as const) l.add(rbox(bw, bh, 0.05, light, bx, by, 0.08));
    const w = wreath(0.26);
    w.position.set(1.3, 2.95, 0.12);
    const handle = leverHandle(-1);
    handle.position.set(DOOR_W - 0.22, 1.55, 0.09);
    l.add(w, handle);
    group.add(l);
    return { group, setOpen: (t) => (l.rotation.y = OUT * t) };
  }
  if (theme === 'hotel') {
    // Cửa gỗ hai cánh có panô và tay nắm đồng, mở ra ngoài từ hai bên
    const half = DOOR_W / 2;
    const left = leaf(half, DOOR_H, p.door, true, 1);
    left.position.x = -half;
    const right = leaf(half, DOOR_H, p.door, true, -1);
    right.position.x = half;
    right.scale.x = -1;
    group.add(left, right);
    return { group, setOpen: (t) => { left.rotation.y = OUT * t; right.rotation.y = -OUT * t; } };
  }
  // Resort: hai cánh kính khung gỗ trượt ngang như cửa tự động
  const panel = (dir: 1 | -1): Group => {
    const g = new Group();
    const w = DOOR_W / 2;
    const glass = new Mesh(new BoxGeometry(w - 0.12, DOOR_H - 0.22, 0.03), mat(KIT.glass, { glow: 0x9fd0ee, glowIntensity: 0.35, opacity: 0.5 }));
    glass.position.set(dir * (w / 2), DOOR_H / 2, 0);
    g.add(glass);
    for (const [bw, bh, bx, by] of [[w, 0.1, dir * (w / 2), DOOR_H - 0.05], [w, 0.1, dir * (w / 2), 0.05], [0.1, DOOR_H, dir * 0.05, DOOR_H / 2], [0.1, DOOR_H, dir * (w - 0.05), DOOR_H / 2]] as const) g.add(rbox(bw, bh, 0.1, p.trim, bx, by, 0));
    g.add(rbox(0.06, 0.9, 0.06, KIT.metal, dir * 0.2, 1.7, 0.08), rbox(0.04, 0.04, 0.08, KIT.metal, dir * 0.2, 1.3, 0.05), rbox(0.04, 0.04, 0.08, KIT.metal, dir * 0.2, 2.1, 0.05));
    return g;
  };
  const a = panel(-1);
  const b = panel(1);
  a.position.z = 0.03;
  b.position.z = -0.03;
  group.add(a, b);
  return { group, setOpen: (t) => { a.position.x = -1.15 * t; b.position.x = 1.15 * t; } };
}

export interface Lobby {
  door: DoorRig;
  /** Vùng sàn bị đồ chiếm chỗ (x–z), để khách đi vòng. */
  obstacles: Rect[];
  /** Gỡ toàn bộ sảnh khỏi cảnh (model dùng chung bộ nhớ đệm nên không giải phóng geometry). */
  dispose(): void;
}

export async function buildLobby(scene: Scene, theme: LobbyTheme = 'homestay'): Promise<Lobby> {
  const root = new Group();
  const obstacles: Rect[] = [];
  root.add(buildShell(theme, obstacles));
  const door = buildDoor(theme);
  root.add(door.group);
  for (const x of [-5, 5]) {
    const l = new PointLight(PALETTES[theme].light, 18, 14, 1.6);
    l.position.set(x, 3.4, -5);
    root.add(l);
  }

  const layout = LOBBY_LAYOUTS[theme];
  const models = await Promise.all(layout.map((p) => loadModel(p.pack, p.model)));
  layout.forEach((p, i) => {
    const obj = models[i]!;
    obj.position.set(p.x, p.y ?? 0, p.z);
    obj.rotation.y = p.rotY ?? 0;
    if (p.scale) obj.scale.setScalar(p.scale);
    obj.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    root.add(obj);
  });
  root.updateMatrixWorld(true);
  // Đồ đứng trên sàn và cao hơn đầu gối thì chặn đường; thảm, tranh treo tường, đồ trên bàn thì không
  models.forEach((obj) => {
    const b = new Box3().setFromObject(obj);
    if (b.min.y < 0.3 && b.max.y - b.min.y > 0.35) obstacles.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
  });
  scene.add(root);
  return { door, obstacles, dispose: () => scene.remove(root) };
}
