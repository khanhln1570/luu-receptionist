// Dữ liệu bố trí sảnh: thuần dữ liệu, không phụ thuộc Three.js để test được.
// Đơn vị theo model KayKit (bàn dài 3, cao 1). Camera đứng sau quầy nhìn về phía cửa (-z).

export type Pack = 'furniture-bits' | 'city-builder-bits';

export interface Placement {
  pack: Pack;
  model: string; // tên file không có đuôi .gltf
  x: number;
  y?: number;
  z: number;
  rotY?: number; // radian
  scale?: number;
}

export const ROOM = { halfWidth: 8, farZ: -10, nearZ: 4, height: 5 } as const;

const f = (model: string, x: number, z: number, extra: Partial<Placement> = {}): Placement => ({
  pack: 'furniture-bits',
  model,
  x,
  z,
  ...extra,
});

const PI2 = Math.PI / 2;

export type LobbyTheme = 'homestay' | 'hotel' | 'resort';
export const LOBBY_THEMES: readonly LobbyTheme[] = ['homestay', 'hotel', 'resort'];

/** Quầy lễ tân: ghép từ 3 bàn dài; `top` là độ cao mặt quầy để đặt đồ trang trí. */
const counter = (top: number): Placement[] => [
  f('table_medium_long', -3, 1.5),
  f('table_medium_long', 0, 1.5),
  f('table_medium_long', 3, 1.5),
  f('lamp_table', -3.8, 1.2, { y: top, scale: 0.8 }),
  f('pictureframe_standing_A', -1.4, 1.1, { y: top, rotY: 0.2 }),
  f('pictureframe_standing_B', 2.4, 1.1, { y: top, rotY: -0.2 }),
  f('book_set', 0.8, 1.2, { y: top }),
];

/** Khu chờ dựa tường xa (vị trí ghế khớp với GuestScene). */
const waiting: Placement[] = [
  f('couch', -5.5, -8.4),
  f('couch_pillows', 5.5, -8.4),
  f('armchair', -2.6, -8.2, { rotY: 0.2 }),
  f('armchair_pillows', 2.6, -8.2, { rotY: -0.2 }),
  f('table_low', -5.5, -5.3),
  f('table_low', 5.5, -5.3),
  f('chair_A_wood', 4.5, -2.5, { rotY: 0.35 }),
  f('chair_B_wood', 5.7, -2.3, { rotY: -0.25 }),
];

const homestay: Placement[] = [
  ...counter(1),
  f('cactus_small_A', 3.6, 1.2, { y: 1 }),
  f('cactus_small_B', -2.4, 1.2, { y: 1 }),
  ...waiting,
  f('rug_oval_A', -5.5, -6.6),
  f('rug_oval_B', 5.5, -6.6),
  f('rug_rectangle_stripes_A', 0, -3.5),
  f('rug_rectangle_B', 0, -8.6),
  // Góc đọc sách
  f('table_small', -5.2, -2.6),
  f('chair_stool_wood', -6.3, -2.2, { rotY: 0.6 }),
  f('chair_stool_wood', -4.2, -2.4, { rotY: -0.6 }),
  f('lamp_table', -5.2, -2.6, { y: 0.55, scale: 0.6 }),
  // Kệ sách, tủ, cây, đèn, ảnh
  f('shelf_B_large_decorated', -7.4, -0.2, { rotY: PI2 }),
  f('shelf_A_big', 7.4, -0.2, { rotY: -PI2 }),
  f('cabinet_medium_decorated', 7.5, -5.2, { rotY: -PI2 }),
  f('shelf_B_small_decorated', -7.5, -5.4, { rotY: PI2 }),
  f('cabinet_small_decorated', -3.6, -9.4),
  f('cabinet_small', 3.6, -9.4),
  f('lamp_standing', -7.2, -9.2),
  f('lamp_standing', 7.2, -9.2),
  f('cactus_medium_A', -7.2, -3.4),
  f('cactus_medium_B', 7.2, -3.0),
  f('cactus_medium_B', -1.4, -9.5),
  f('cactus_medium_A', 1.4, -9.5),
  f('pictureframe_large_A', -5.5, -9.8, { y: 2.8 }),
  f('pictureframe_large_B', 5.5, -9.8, { y: 2.8 }),
  f('pictureframe_medium', -2.6, -9.8, { y: 2.9 }),
  f('pictureframe_small_A', 2.6, -9.8, { y: 2.9 }),
  f('pictureframe_small_B', -7.0, -9.8, { y: 2.4 }),
  f('pictureframe_small_C', 7.0, -9.8, { y: 2.4 }),
  f('pictureframe_medium', -7.9, -7, { y: 2.6, rotY: PI2 }),
  f('pictureframe_small_A', 7.9, -7, { y: 2.6, rotY: -PI2 }),
];

// Khách sạn: mặt quầy đá cao hơn 0,06, thảm lớn, tủ trưng bày, đèn đứng đối xứng.
const hotel: Placement[] = [
  ...counter(1.06),
  ...waiting,
  f('rug_rectangle_A', -5.5, -6.8, { scale: 1.3 }),
  f('rug_rectangle_A', 5.5, -6.8, { scale: 1.3 }),
  f('rug_rectangle_stripes_B', 0, -3.5, { scale: 1.2 }),
  f('cabinet_medium_decorated', -7.5, -2.0, { rotY: PI2 }),
  f('cabinet_medium_decorated', 7.5, -2.0, { rotY: -PI2 }),
  f('cabinet_small_decorated', -3.6, -9.4),
  f('cabinet_small_decorated', 3.6, -9.4),
  f('lamp_standing', -7.2, -9.2),
  f('lamp_standing', 7.2, -9.2),
  f('lamp_standing', -7.2, -5.0),
  f('lamp_standing', 7.2, -5.0),
  f('pictureframe_large_A', -5.5, -9.8, { y: 2.8 }),
  f('pictureframe_large_B', 5.5, -9.8, { y: 2.8 }),
  f('pictureframe_large_A', -2.6, -9.8, { y: 2.8 }),
  f('pictureframe_large_B', 2.6, -9.8, { y: 2.8 }),
  f('pictureframe_large_A', -7.9, -7, { y: 2.8, rotY: PI2 }),
  f('pictureframe_large_B', 7.9, -7, { y: 2.8, rotY: -PI2 }),
];

// Resort: thoáng, ít đồ, nhiều cây; mặt quầy gỗ sáng.
const resort: Placement[] = [
  ...counter(1.06),
  ...waiting,
  f('rug_oval_A', -5.5, -6.7, { scale: 1.4 }),
  f('rug_oval_B', 5.5, -6.7, { scale: 1.4 }),
  f('rug_rectangle_stripes_A', 0, -3.5, { scale: 1.2 }),
  f('rug_oval_A', 0, -8.7, { scale: 1.2 }),
  f('table_small', -4.6, -2.8),
  f('chair_stool_wood', -5.6, -2.5, { rotY: 0.6 }),
  f('chair_stool_wood', -3.6, -2.6, { rotY: -0.6 }),
  f('cabinet_medium_decorated', -7.5, -0.6, { rotY: PI2 }),
  f('cabinet_medium_decorated', 7.5, -0.6, { rotY: -PI2 }),
  f('lamp_standing', -7.2, -9.2),
  f('lamp_standing', 7.2, -9.2),
  f('pictureframe_large_A', -7.9, -7, { y: 2.8, rotY: PI2 }),
  f('pictureframe_large_B', 7.9, -7, { y: 2.8, rotY: -PI2 }),
];

export const LOBBY_LAYOUTS: Record<LobbyTheme, Placement[]> = { homestay, hotel, resort };
/** Bố cục mặc định (homestay). */
export const LOBBY = homestay;
