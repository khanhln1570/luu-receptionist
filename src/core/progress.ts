import type { HotelConfig } from './game';
import type { HotelDef } from './hotels';
import { REPUTATION, applyReputation, clampReputation, reputationChange } from './reputation';
import { emptyRegular, recordRegularVisit, type RegularOutcome, type RegularState } from './regulars';
import type { DayResult } from './scoring';
import { applyUpgrades, upgradeById } from './upgrades';
import { fail, type Result } from './result';

export interface HotelProgress {
  days: number; // tổng số ngày đã chơi
  goodDays: number; // số ngày đạt đủ sao tối thiểu
  bestStars: number;
  bestScore: number;
}

export interface SaveData {
  version: 1;
  hotels: Record<string, HotelProgress>;
  money: number; // tiền tích lũy, dùng để mua nâng cấp
  reputation: Record<string, number>; // danh tiếng theo khách sạn
  upgrades: Record<string, string[]>; // nâng cấp đã mua theo khách sạn
  regulars: Record<string, RegularState>; // khách quen đã ghé bao nhiêu lần
  chapters: Record<string, number>; // số chương truyện đã kể theo khách sạn
}

export const emptySave = (): SaveData => ({ version: 1, hotels: {}, money: 0, reputation: {}, upgrades: {}, regulars: {}, chapters: {} });
export const emptyProgress = (): HotelProgress => ({ days: 0, goodDays: 0, bestStars: 0, bestScore: 0 });

export const progressOf = (save: SaveData, hotelId: string): HotelProgress => save.hotels[hotelId] ?? emptyProgress();

export function isCompleted(hotel: HotelDef, save: SaveData): boolean {
  return progressOf(save, hotel.id).goodDays >= hotel.goal.days;
}

export function isUnlocked(hotel: HotelDef, save: SaveData, all: readonly HotelDef[]): boolean {
  if (hotel.requires === null) return true;
  const req = all.find((h) => h.id === hotel.requires);
  return !!req && isCompleted(req, save);
}

export interface DayOutcome {
  save: SaveData;
  progress: HotelProgress;
  goodDay: boolean;
  justCompleted: boolean; // vừa hoàn thành khách sạn này ở ngày này
  unlocked: HotelDef[]; // các khách sạn vừa được mở khóa nhờ ngày này
}

/** Ghi kết quả một ngày chơi. Không sửa save cũ. */
export function recordDay(save: SaveData, hotel: HotelDef, result: DayResult, all: readonly HotelDef[]): DayOutcome {
  const before = progressOf(save, hotel.id);
  const goodDay = result.stars >= hotel.goal.minStars;
  const progress: HotelProgress = {
    days: before.days + 1,
    goodDays: before.goodDays + (goodDay ? 1 : 0),
    bestStars: Math.max(before.bestStars, result.stars),
    bestScore: Math.max(before.bestScore, result.score),
  };
  const next: SaveData = { ...save, hotels: { ...save.hotels, [hotel.id]: progress } };
  const wasDone = isCompleted(hotel, save);
  const justCompleted = !wasDone && isCompleted(hotel, next);
  const unlocked = justCompleted ? all.filter((h) => h.requires === hotel.id && !isUnlocked(h, save, all) && isUnlocked(h, next, all)) : [];
  return { save: next, progress, goodDay, justCompleted, unlocked };
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Chỉ giữ các giá trị đúng kiểu; phần hỏng bị bỏ qua chứ không làm hỏng cả bản lưu. */
function cleanMap<T>(raw: unknown, accept: (v: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw)) {
    const x = accept(v);
    if (x !== undefined) out[k] = x;
  }
  return out;
}

/** Đọc dữ liệu lưu; hỏng hoặc sai định dạng thì quay về trạng thái trống (không làm game lỗi). Bản lưu cũ thiếu trường mới vẫn đọc được. */
export function parseSave(raw: string | null): SaveData {
  if (!raw) return emptySave();
  try {
    const data = JSON.parse(raw) as Record<string, unknown> & { hotels?: Record<string, Partial<HotelProgress>> };
    if (data?.version !== 1 || typeof data.hotels !== 'object' || data.hotels === null) return emptySave();
    const hotels: Record<string, HotelProgress> = {};
    for (const [id, p] of Object.entries(data.hotels)) {
      const ok = [p?.days, p?.goodDays, p?.bestStars, p?.bestScore].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
      if (ok) hotels[id] = { days: p!.days!, goodDays: p!.goodDays!, bestStars: p!.bestStars!, bestScore: p!.bestScore! };
    }
    return {
      version: 1,
      hotels,
      money: isNum(data.money) && data.money >= 0 ? data.money : 0,
      reputation: cleanMap(data.reputation, (v) => (isNum(v) ? clampReputation(v) : undefined)),
      upgrades: cleanMap(data.upgrades, (v) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && !!upgradeById(u)) : undefined)),
      regulars: cleanMap(data.regulars, (v) => {
        const r = v as Partial<RegularState> | null;
        return r && isNum(r.visits) && r.visits >= 0 && isNum(r.mood) ? { visits: r.visits, mood: r.mood, gone: r.gone === true } : undefined;
      }),
      chapters: cleanMap(data.chapters, (v) => (isNum(v) && v >= 0 ? Math.floor(v) : undefined)),
    };
  } catch {
    return emptySave();
  }
}

export const reputationOf = (save: SaveData, hotelId: string): number => save.reputation[hotelId] ?? REPUTATION.start;
export const upgradesOf = (save: SaveData, hotelId: string): readonly string[] => save.upgrades[hotelId] ?? [];

/** Cấu hình của ngày chơi: nâng cấp đã mua và danh tiếng hiện tại đã được áp vào. */
export function dayConfigFor(hotel: HotelDef, save: SaveData): HotelConfig {
  const config = applyUpgrades(hotel.config, upgradesOf(save, hotel.id));
  return { ...config, params: applyReputation(config.params, reputationOf(save, hotel.id)) };
}

export interface DaySettlement {
  revenue: number; // doanh thu trong ngày (cộng vào tiền tích lũy nếu dương)
  stars: DayResult['stars'];
  reputationBonus: number; // biến cố trong ngày: review, khách quen...
  regulars: readonly RegularOutcome[];
  seenChapters: number; // số chương truyện đã kể sau ngày này
}

/** Ghi phần ngoài sao/điểm của một ngày: tiền, danh tiếng, khách quen, chương truyện. Không sửa save cũ. */
export function settleDay(save: SaveData, hotelId: string, d: DaySettlement): SaveData {
  const regulars = { ...save.regulars };
  for (const r of d.regulars) regulars[r.id] = recordRegularVisit(regulars[r.id] ?? emptyRegular(), r.satisfaction);
  return {
    ...save,
    money: save.money + Math.max(0, Math.round(d.revenue)),
    reputation: { ...save.reputation, [hotelId]: clampReputation(reputationOf(save, hotelId) + reputationChange(d.stars, d.reputationBonus)) },
    regulars,
    chapters: { ...save.chapters, [hotelId]: d.seenChapters },
  };
}

/** Mua một nâng cấp cho khách sạn bằng tiền tích lũy. */
export function buyUpgrade(save: SaveData, hotelId: string, upgradeId: string): Result & { save?: SaveData } {
  const up = upgradeById(upgradeId);
  if (!up) return fail('Không có nâng cấp này');
  if (upgradesOf(save, hotelId).includes(up.id)) return fail('Đã mua rồi');
  if (save.money < up.price) return fail('Không đủ tiền');
  return { ok: true, save: { ...save, money: save.money - up.price, upgrades: { ...save.upgrades, [hotelId]: [...upgradesOf(save, hotelId), up.id] } } };
}
