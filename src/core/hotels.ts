import type { HotelConfig } from './game';
import { LOBBY_THEMES, type LobbyTheme } from '../render/lobbyLayout';
import type { Room, RoomType } from './rooms';
import type { TaskConfig } from './tasks';

export interface HotelDef {
  id: string;
  name: string;
  description: string;
  lobby: LobbyTheme; // kiểu sảnh 3D
  requires: string | null; // id khách sạn phải hoàn thành trước, null = mở sẵn
  goal: { days: number; minStars: number }; // cần `days` ngày đạt ít nhất `minStars` sao
  config: HotelConfig;
}

/** Một nhóm phòng cùng tầng, cùng loại, cùng giá. Phòng đầu nhóm có khách ở sẵn, rồi chưa dọn, rồi hỏng. */
export interface RoomGroup {
  floor: number;
  type: RoomType;
  count: number;
  price: number;
  occupied?: number;
  dirty?: number;
  broken?: number;
}

const ROOM_TYPES: readonly RoomType[] = ['don', 'doi', 'vip'];
const DEFAULT_TASK_MINUTES: TaskConfig['minutes'] = { cleaning: 30, repair: 90, service: 10, fix: 25 };

/** Dựng danh sách phòng từ các nhóm; số phòng đánh theo tầng: 101, 102, ... 201, ... */
export function buildRooms(groups: readonly RoomGroup[]): Room[] {
  const nextOnFloor = new Map<number, number>();
  const rooms: Room[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const n = (nextOnFloor.get(g.floor) ?? 0) + 1;
      nextOnFloor.set(g.floor, n);
      const occ = g.occupied ?? 0;
      const dirty = g.dirty ?? 0;
      const status = i < occ ? 'occupied' : i < occ + dirty ? 'dirty' : i < occ + dirty + (g.broken ?? 0) ? 'broken' : 'vacant_clean';
      rooms.push({ id: `${g.floor}${String(n).padStart(2, '0')}`, floor: g.floor, type: g.type, price: g.price, status });
    }
  }
  return rooms;
}

const isInt = (n: unknown, min: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min;
const isRate = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;

/** Kiểm tra và dựng khách sạn từ JSON. Lỗi nào cũng báo kèm id khách sạn. */
export function parseHotels(data: unknown): HotelDef[] {
  const errors: string[] = [];
  if (!Array.isArray(data) || data.length === 0) throw new Error('Danh sách khách sạn phải là mảng không rỗng');
  const hotels: HotelDef[] = [];
  const ids = new Set<string>();

  data.forEach((raw, i) => {
    const h = raw as Record<string, any>;
    const where = `Khách sạn #${i + 1} (${h?.id ?? 'không có id'})`;
    const err = (msg: string) => errors.push(`${where}: ${msg}`);
    if (!h || typeof h.id !== 'string' || !h.id) return err('thiếu id');
    if (ids.has(h.id)) err('trùng id');
    ids.add(h.id);
    if (typeof h.name !== 'string' || !h.name) err('thiếu name');

    if (h.lobby !== undefined && !LOBBY_THEMES.includes(h.lobby)) err(`lobby phải là một trong: ${LOBBY_THEMES.join(', ')}`);
    const requires = h.unlock?.requires ?? null;
    if (requires !== null && typeof requires !== 'string') err('unlock.requires phải là id hoặc null');
    if (!isInt(h.goal?.days, 1)) err('goal.days phải là số nguyên ≥ 1');
    if (!isInt(h.goal?.minStars, 1) || h.goal.minStars > 5) err('goal.minStars phải từ 1 đến 5');

    const groups = h.roomGroups as RoomGroup[] | undefined;
    if (!Array.isArray(groups) || groups.length === 0) err('thiếu roomGroups');
    else {
      groups.forEach((g, j) => {
        const ge = (msg: string) => err(`roomGroups[${j}]: ${msg}`);
        if (!isInt(g.floor, 1)) ge('floor phải là số nguyên ≥ 1');
        if (!ROOM_TYPES.includes(g.type)) ge(`type không hợp lệ: ${String(g.type)}`);
        if (!isInt(g.count, 1)) ge('count phải là số nguyên ≥ 1');
        if (typeof g.price !== 'number' || g.price <= 0) ge('price phải > 0');
        for (const k of ['occupied', 'dirty', 'broken'] as const) if (g[k] !== undefined && !isInt(g[k], 0)) ge(`${k} phải là số nguyên ≥ 0`);
        if (isInt(g.count, 1) && (g.occupied ?? 0) + (g.dirty ?? 0) + (g.broken ?? 0) > g.count) ge('occupied + dirty + broken vượt quá count');
      });
      for (const f of new Set(groups.map((g) => g.floor))) {
        if (groups.filter((g) => g.floor === f).reduce((s, g) => s + (isInt(g.count, 0) ? g.count : 0), 0) > 99) err(`tầng ${f} quá 99 phòng`);
      }
    }

    if (!isInt(h.staff?.housekeeping, 0) || !isInt(h.staff?.maintenance, 0)) err('staff.housekeeping và staff.maintenance phải là số nguyên ≥ 0');

    const d = h.difficulty ?? {};
    const gpd = d.guestsPerDay;
    if (!Array.isArray(gpd) || gpd.length !== 2 || !isInt(gpd[0], 0) || !isInt(gpd[1], 0) || gpd[0] > gpd[1]) err('difficulty.guestsPerDay phải là [min, max] số nguyên, min ≤ max');
    if (typeof d.patienceMinutes !== 'number' || d.patienceMinutes <= 0) err('difficulty.patienceMinutes phải > 0');
    for (const k of ['walkInRate', 'incidentRate', 'overbookingRate', 'specialRate']) {
      if (d[k] !== undefined && !isRate(d[k])) err(`difficulty.${k} phải trong [0, 1]`);
    }

    if (errors.some((e) => e.startsWith(where))) return;
    hotels.push({
      id: h.id,
      name: h.name,
      description: typeof h.description === 'string' ? h.description : '',
      lobby: h.lobby ?? 'homestay',
      requires,
      goal: { days: h.goal.days, minStars: h.goal.minStars },
      config: {
        name: h.name,
        rooms: buildRooms(groups!),
        staff: { housekeeping: h.staff.housekeeping, maintenance: h.staff.maintenance },
        taskMinutes: { ...DEFAULT_TASK_MINUTES, ...(h.taskMinutes ?? {}) },
        params: {
          guestsPerDay: [gpd[0], gpd[1]],
          patienceMinutes: d.patienceMinutes,
          walkInRate: d.walkInRate ?? 0,
          openMinute: 8 * 60,
          closeMinute: 22 * 60,
          incidentRate: d.incidentRate ?? 0,
          overbookingRate: d.overbookingRate ?? 0,
          specialRate: d.specialRate ?? 0,
        },
      },
    });
  });

  // Chuỗi mở khóa: phải trỏ tới khách sạn có thật, không vòng lặp, và có ít nhất một khách sạn mở sẵn.
  for (const h of hotels) {
    if (h.requires !== null && !ids.has(h.requires)) errors.push(`Khách sạn ${h.id}: unlock.requires trỏ tới "${h.requires}" không tồn tại`);
    if (h.requires === h.id) errors.push(`Khách sạn ${h.id}: không thể yêu cầu chính nó`);
  }
  if (!errors.length) {
    if (!hotels.some((h) => h.requires === null)) errors.push('Phải có ít nhất một khách sạn mở sẵn (unlock.requires = null)');
    for (const h of hotels) {
      const seen = new Set<string>();
      for (let cur: HotelDef | undefined = h; cur?.requires; cur = hotels.find((x) => x.id === cur!.requires)) {
        if (seen.has(cur.id)) {
          errors.push(`Chuỗi mở khóa có vòng lặp quanh "${cur.id}"`);
          break;
        }
        seen.add(cur.id);
      }
    }
  }

  if (errors.length) throw new Error(`Dữ liệu khách sạn không hợp lệ:\n${[...new Set(errors)].join('\n')}`);
  return hotels;
}
