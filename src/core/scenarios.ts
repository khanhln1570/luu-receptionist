import { ROOM_TYPE_LABEL } from './labels';
import type { RoomType } from './rooms';

export type ScenarioType = 'incident' | 'overbooking' | 'special';
/** Điều kiện về phòng để một lựa chọn dùng được. */
export type Requirement = 'spareRoom' | 'upgradeRoom' | 'lowerRoom';

export interface Effects {
  satisfaction?: number; // cộng/trừ độ hài lòng
  money?: number; // thu thêm (+) hoặc bồi thường/giảm giá (−), đơn vị đồng
  task?: 'service' | 'fix'; // giao việc cho buồng phòng / bảo trì tại phòng của khách
  moveRoom?: 'same' | 'upgrade'; // đổi phòng cho khách đang ở
  oldRoom?: 'dirty' | 'broken'; // tình trạng phòng cũ sau khi đổi
  checkIn?: 'upgrade' | 'lower'; // xếp phòng khác loại cho khách đã đặt (overbooking)
  cancel?: boolean; // hủy đặt phòng, khách ra về (overbooking)
}

export interface ScenarioOption {
  text: string;
  result: string; // lời kể kết quả, hiện sau khi chọn
  requires?: Requirement;
  effects: Effects;
}

export interface Scenario {
  id: string;
  type: ScenarioType;
  guest?: string; // tên cố định của người đến (ví dụ chủ khách sạn); không có thì khách ngẫu nhiên
  lines: string[];
  options: ScenarioOption[];
}

export const TIERS: readonly RoomType[] = ['don', 'doi', 'vip'];
export const VARIABLES = ['ten', 'phong', 'loai', 'loaiCao', 'loaiThap'] as const;
export type Variables = Record<(typeof VARIABLES)[number], string>;

export const higherType = (t: RoomType): RoomType | undefined => TIERS[TIERS.indexOf(t) + 1];
export const lowerType = (t: RoomType): RoomType | undefined => TIERS[TIERS.indexOf(t) - 1];

/** Thay {ten}, {phong}... trong lời thoại. */
export function fill(text: string, vars: Variables): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? vars[key as keyof Variables] : m));
}

export function variablesFor(guestName: string, roomId: string | undefined, type: RoomType): Variables {
  const up = higherType(type);
  const down = lowerType(type);
  return {
    ten: guestName,
    phong: roomId ?? '',
    loai: ROOM_TYPE_LABEL[type],
    loaiCao: up ? ROOM_TYPE_LABEL[up] : '',
    loaiThap: down ? ROOM_TYPE_LABEL[down] : '',
  };
}

const TYPES: readonly ScenarioType[] = ['incident', 'overbooking', 'special'];
const REQUIREMENTS: readonly Requirement[] = ['spareRoom', 'upgradeRoom', 'lowerRoom'];
const EFFECT_KEYS = ['satisfaction', 'money', 'task', 'moveRoom', 'oldRoom', 'checkIn', 'cancel'];

/** Kiểm tra dữ liệu kịch bản đọc từ JSON. Lỗi nào cũng báo kèm id tình huống để sửa file. */
export function validateScenarios(data: unknown): Scenario[] {
  const errors: string[] = [];
  if (!Array.isArray(data)) throw new Error('Kịch bản phải là một mảng');
  const seen = new Set<string>();

  data.forEach((raw, i) => {
    const s = raw as Partial<Scenario>;
    const where = `Tình huống #${i + 1} (${s?.id ?? 'không có id'})`;
    const err = (msg: string) => errors.push(`${where}: ${msg}`);

    if (!s || typeof s.id !== 'string' || !s.id) return err('thiếu id');
    if (seen.has(s.id)) err('trùng id');
    seen.add(s.id);
    if (!TYPES.includes(s.type as ScenarioType)) err(`type không hợp lệ: ${String(s.type)}`);
    if (!Array.isArray(s.lines) || s.lines.length === 0 || s.lines.some((l) => typeof l !== 'string' || !l)) {
      err('lines phải là mảng chuỗi không rỗng');
    }
    if (!Array.isArray(s.options) || s.options.length < 1 || s.options.length > 4) {
      return err('cần từ 1 đến 4 lựa chọn');
    }

    const texts: string[] = [...(s.lines ?? [])];
    s.options.forEach((o, j) => {
      const oe = (msg: string) => err(`lựa chọn ${j + 1}: ${msg}`);
      if (typeof o.text !== 'string' || !o.text) oe('thiếu text');
      if (typeof o.result !== 'string' || !o.result) oe('thiếu result');
      texts.push(o.text ?? '', o.result ?? '');
      if (o.requires !== undefined && !REQUIREMENTS.includes(o.requires)) oe(`requires không hợp lệ: ${String(o.requires)}`);
      const e = o.effects;
      if (!e || typeof e !== 'object') return oe('thiếu effects');
      for (const k of Object.keys(e)) if (!EFFECT_KEYS.includes(k)) oe(`effect lạ: ${k}`);
      if (e.satisfaction !== undefined && (typeof e.satisfaction !== 'number' || Math.abs(e.satisfaction) > 50)) oe('satisfaction phải là số trong [-50, 50]');
      if (e.money !== undefined && typeof e.money !== 'number') oe('money phải là số');
      if (e.moveRoom && s.type !== 'incident') oe('moveRoom chỉ dùng cho incident');
      if (e.task && s.type !== 'incident') oe('task chỉ dùng cho incident');
      if ((e.checkIn || e.cancel) && s.type !== 'overbooking') oe('checkIn/cancel chỉ dùng cho overbooking');
      if (e.oldRoom && !e.moveRoom) oe('oldRoom cần đi cùng moveRoom');
      if (e.moveRoom === 'same' && o.requires !== 'spareRoom') oe('moveRoom "same" cần requires "spareRoom"');
      if (e.moveRoom === 'upgrade' && o.requires !== 'upgradeRoom') oe('moveRoom "upgrade" cần requires "upgradeRoom"');
      if (e.checkIn === 'upgrade' && o.requires !== 'upgradeRoom') oe('checkIn "upgrade" cần requires "upgradeRoom"');
      if (e.checkIn === 'lower' && o.requires !== 'lowerRoom') oe('checkIn "lower" cần requires "lowerRoom"');
    });
    if (s.type === 'overbooking' && !s.options.some((o) => o.effects?.cancel)) {
      err('overbooking cần ít nhất một lựa chọn kết thúc bằng cancel (đường lui khi hết phòng)');
    }
    for (const t of texts) {
      for (const m of t.matchAll(/\{(\w+)\}/g)) {
        if (!(VARIABLES as readonly string[]).includes(m[1]!)) err(`biến lạ {${m[1]}}`);
      }
    }
  });

  if (errors.length) throw new Error(`Kịch bản không hợp lệ:\n${errors.join('\n')}`);
  return data as Scenario[];
}
