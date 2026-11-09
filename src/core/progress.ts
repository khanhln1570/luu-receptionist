import type { HotelDef } from './hotels';
import type { DayResult } from './scoring';

export interface HotelProgress {
  days: number; // tổng số ngày đã chơi
  goodDays: number; // số ngày đạt đủ sao tối thiểu
  bestStars: number;
  bestScore: number;
}

export interface SaveData {
  version: 1;
  hotels: Record<string, HotelProgress>;
}

export const emptySave = (): SaveData => ({ version: 1, hotels: {} });
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
  const next: SaveData = { version: 1, hotels: { ...save.hotels, [hotel.id]: progress } };
  const wasDone = isCompleted(hotel, save);
  const justCompleted = !wasDone && isCompleted(hotel, next);
  const unlocked = justCompleted ? all.filter((h) => h.requires === hotel.id && !isUnlocked(h, save, all) && isUnlocked(h, next, all)) : [];
  return { save: next, progress, goodDay, justCompleted, unlocked };
}

/** Đọc dữ liệu lưu; hỏng hoặc sai định dạng thì quay về trạng thái trống (không làm game lỗi). */
export function parseSave(raw: string | null): SaveData {
  if (!raw) return emptySave();
  try {
    const data = JSON.parse(raw) as { version?: unknown; hotels?: Record<string, Partial<HotelProgress>> };
    if (data?.version !== 1 || typeof data.hotels !== 'object' || data.hotels === null) return emptySave();
    const hotels: Record<string, HotelProgress> = {};
    for (const [id, p] of Object.entries(data.hotels)) {
      const ok = [p?.days, p?.goodDays, p?.bestStars, p?.bestScore].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
      if (ok) hotels[id] = { days: p!.days!, goodDays: p!.goodDays!, bestStars: p!.bestStars!, bestScore: p!.bestScore! };
    }
    return { version: 1, hotels };
  } catch {
    return emptySave();
  }
}
