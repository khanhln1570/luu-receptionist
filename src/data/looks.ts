/**
 * Ngoại hình khách: lấy model nhân vật KayKit (Adventurers), ẩn mũ/áo choàng/giáp,
 * đổi màu da–tóc–áo–quần trên bảng màu 8×8 ô và thêm phụ kiện du lịch.
 * Dữ liệu thuần, dùng cho công cụ render portrait (tools/portrait.ts) và cho game.
 */
export type Model = 'Ranger' | 'Mage' | 'Rogue' | 'Barbarian';
export type Accessory = 'sunhat' | 'shades' | 'camera';

/** Ô trên bảng màu (hàng,cột) theo từng vai trò; mỗi model dùng ô khác nhau. */
export type Role = 'skin' | 'hair' | 'shirt' | 'pants' | 'accent' | 'bracer' | 'trim' | 'shoes';
/** bracer = vòng tay/găng (đổi thành da → tay áo ngắn); trim = đai, túi, khóa (hòa vào quần); shoes = giày bốt. */
export const PALETTE_CELLS: Record<Model, Partial<Record<Role, string[]>>> = {
  Ranger: { skin: ['1,0', '0,0'], hair: ['1,1', '0,1'], shirt: ['0,5', '0,6', '1,5', '1,6'], pants: ['4,3', '5,3'], accent: ['2,0', '3,0'], bracer: ['5,7', '4,7'], trim: ['1,7', '0,7', '1,3', '0,3', '3,1', '2,1'], shoes: ['3,7', '2,7'] },
  Mage: { skin: ['1,0', '0,0', '5,7'], hair: ['0,1', '1,1'], shirt: ['2,0', '3,0'], pants: ['4,3', '5,3'], bracer: ['0,4', '1,4'], trim: ['0,3', '1,5', '0,5'], shoes: ['3,7', '2,7'] },
  Rogue: { skin: ['1,0', '0,0'], hair: ['1,1', '0,1'], shirt: ['2,0', '3,0', '2,1', '3,1'], pants: ['4,3', '5,3'], bracer: ['5,7', '4,7'], trim: ['1,5', '0,5', '1,6', '0,3'], shoes: ['3,7', '2,7'] },
  Barbarian: { skin: ['1,0', '0,0'], hair: ['0,1', '1,1'], shirt: ['1,7', '7,1', '3,2', '1,6', '3,6', '3,5', '0,7'], pants: ['4,3', '5,3'], shoes: ['3,7', '2,7'] },
};

/** Phần mesh bị ẩn (hậu tố tên node) để bớt vẻ phiêu lưu. */
export const HIDDEN_PARTS = ['Cape', 'Quiver', 'Hat', 'BearHat', 'Helmet', 'HelmetVisor', 'Mask'];

export interface Look {
  id: string;
  model: Model;
  skin: string;
  hair: string;
  shirt?: string;
  pants?: string;
  accent?: string;
  shoes?: string;
  accessories?: Accessory[];
}

export const POSES = ['binh-thuong', 'hoi', 'buc'] as const;
export type Pose = (typeof POSES)[number];

/** Lễ tân (nhân vật chính) đứng sau quầy: áo sơ mi trắng, quần tối, khăn đỏ. Không nằm trong LOOKS để khách không trùng. */
export const RECEPTIONIST: Look = { id: 'le-tan', model: 'Rogue', skin: '#f1c9a5', hair: '#2b1d16', shirt: '#f4f1ea', pants: '#2f3441', accent: '#c0392b', shoes: '#1d1f26' };

export const LOOKS: Look[] = [
  { id: 'du-khach-1', model: 'Ranger', skin: '#f1c9a5', hair: '#3b2a20', shirt: '#f2a03d', pants: '#d8c9a3', accent: '#e0443e', accessories: ['sunhat', 'camera'] },
  { id: 'du-khach-2', model: 'Mage', skin: '#c98f68', hair: '#161213', shirt: '#2fb5a8', pants: '#34495e', accessories: ['shades'] },
  { id: 'du-khach-3', model: 'Rogue', skin: '#f7d8bd', hair: '#d8a84a', shirt: '#e8567a', pants: '#e9e2d0', accessories: ['sunhat'] },
  { id: 'du-khach-4', model: 'Rogue', skin: '#e0ac86', hair: '#9a9a9a', shirt: '#3a7bd5', pants: '#a08060', accessories: ['camera'] },
  { id: 'du-khach-5', model: 'Ranger', skin: '#8d5a3b', hair: '#1a1210', shirt: '#6fbf5a', pants: '#2c3e63', accent: '#f2d03b', accessories: ['shades'] },
  { id: 'du-khach-6', model: 'Mage', skin: '#ffd9bf', hair: '#7a3b22', shirt: '#9b59d0', pants: '#cfd6dc', accessories: ['sunhat', 'camera'] },
  { id: 'du-khach-7', model: 'Rogue', skin: '#b9754d', hair: '#2a1b14', shirt: '#4aa3e8', pants: '#7a6a4f', accessories: ['camera'] },
  { id: 'du-khach-8', model: 'Ranger', skin: '#f3c3a0', hair: '#b5532f', shirt: '#e8c43a', pants: '#2f4f4f', accessories: ['sunhat', 'shades'] },
];

/** Chọn ngoại hình ổn định theo tên khách (cùng tên luôn cùng mặt). */
export function lookIdFor(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return LOOKS[(h >>> 0) % LOOKS.length]!.id;
}

export function portraitPath(name: string, pose: Pose): string {
  return `assets/portraits/${lookIdFor(name)}/${pose}.png`;
}
