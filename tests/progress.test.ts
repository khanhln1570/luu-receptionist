import { describe, expect, it } from 'vitest';
import { parseHotels } from '../src/core/hotels';
import { emptySave, isCompleted, isUnlocked, parseSave, progressOf, recordDay } from '../src/core/progress';
import type { DayResult } from '../src/core/scoring';
import { SaveStore } from '../src/save/store';

const base = {
  name: 'x',
  roomGroups: [{ floor: 1, type: 'don', count: 2, price: 1 }],
  staff: { housekeeping: 1, maintenance: 1 },
  difficulty: { guestsPerDay: [1, 2], patienceMinutes: 10 },
};
const HOTELS = parseHotels([
  { ...base, id: 'a', unlock: { requires: null }, goal: { days: 2, minStars: 3 } },
  { ...base, id: 'b', unlock: { requires: 'a' }, goal: { days: 1, minStars: 4 } },
  { ...base, id: 'c', unlock: { requires: 'b' }, goal: { days: 1, minStars: 1 } },
]);
const [A, B, C] = HOTELS as [(typeof HOTELS)[0], (typeof HOTELS)[0], (typeof HOTELS)[0]];
const day = (stars: 1 | 2 | 3 | 4 | 5, score = stars * 20): DayResult => ({ stars, score, satisfaction: 0, revenue: 0, revenueTarget: 0, revenueScore: 0 });

describe('mở khóa', () => {
  it('khách sạn đầu mở sẵn, các khách sạn sau khóa cho tới khi hoàn thành khách sạn trước', () => {
    const s = emptySave();
    expect([isUnlocked(A, s, HOTELS), isUnlocked(B, s, HOTELS), isUnlocked(C, s, HOTELS)]).toEqual([true, false, false]);
  });
});

describe('recordDay', () => {
  it('chỉ ngày đạt đủ sao mới tính là ngày tốt; ngày kém vẫn tính vào tổng số ngày', () => {
    const r1 = recordDay(emptySave(), A, day(2), HOTELS);
    expect(r1.goodDay).toBe(false);
    expect(r1.progress).toEqual({ days: 1, goodDays: 0, bestStars: 2, bestScore: 40 });
    const r2 = recordDay(r1.save, A, day(3), HOTELS);
    expect(r2.goodDay).toBe(true);
    expect(r2.progress).toEqual({ days: 2, goodDays: 1, bestStars: 3, bestScore: 60 });
  });

  it('ngày kém không làm giảm kỷ lục', () => {
    let s = recordDay(emptySave(), A, day(5, 95), HOTELS).save;
    s = recordDay(s, A, day(1, 10), HOTELS).save;
    expect(progressOf(s, 'a')).toMatchObject({ bestStars: 5, bestScore: 95, days: 2, goodDays: 1 });
  });

  it('đủ số ngày tốt thì hoàn thành và mở khóa khách sạn kế, chỉ báo một lần', () => {
    let out = recordDay(emptySave(), A, day(3), HOTELS);
    expect(out.justCompleted).toBe(false);
    expect(isCompleted(A, out.save)).toBe(false);
    expect(out.unlocked).toEqual([]);
    out = recordDay(out.save, A, day(4), HOTELS);
    expect(out.justCompleted).toBe(true);
    expect(isCompleted(A, out.save)).toBe(true);
    expect(out.unlocked.map((h) => h.id)).toEqual(['b']);
    expect(isUnlocked(B, out.save, HOTELS)).toBe(true);
    expect(isUnlocked(C, out.save, HOTELS)).toBe(false);
    const again = recordDay(out.save, A, day(5), HOTELS); // chơi lại khách sạn đã xong
    expect(again.justCompleted).toBe(false);
    expect(again.unlocked).toEqual([]);
  });

  it('không sửa save cũ', () => {
    const s = emptySave();
    recordDay(s, A, day(5), HOTELS);
    expect(s).toEqual(emptySave());
  });
});

describe('parseSave', () => {
  it('dữ liệu hỏng, sai phiên bản hoặc sai kiểu thì trả về save trống', () => {
    for (const raw of [null, '', 'không phải json', '{}', '{"version":2,"hotels":{}}', '{"version":1,"hotels":null}', '[]']) {
      expect(parseSave(raw), String(raw)).toEqual(emptySave());
    }
  });
  it('bỏ qua mục tiến trình hỏng nhưng giữ mục tốt', () => {
    const raw = JSON.stringify({ version: 1, hotels: { a: { days: 1, goodDays: 1, bestStars: 3, bestScore: 60 }, b: { days: 'x' }, c: { days: -1, goodDays: 0, bestStars: 0, bestScore: 0 } } });
    expect(Object.keys(parseSave(raw).hotels)).toEqual(['a']);
  });
});

describe('SaveStore', () => {
  const fake = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };

  it('lưu rồi đọc lại bằng store mới (giữ qua lần tải trang)', () => {
    const storage = fake();
    const save = recordDay(emptySave(), A, day(4), HOTELS).save;
    new SaveStore(storage).save(save);
    expect(new SaveStore(storage).load()).toEqual(save);
  });
  it('reset xóa tiến trình', () => {
    const storage = fake();
    const store = new SaveStore(storage);
    store.save(recordDay(emptySave(), A, day(4), HOTELS).save);
    store.reset();
    expect(store.load()).toEqual(emptySave());
    expect(new SaveStore(storage).load()).toEqual(emptySave());
  });
  it('lưu trữ bị chặn hoặc báo lỗi thì game vẫn chạy, tiến trình giữ trong phiên', () => {
    const broken = { getItem: () => { throw new Error('chặn'); }, setItem: () => { throw new Error('đầy'); }, removeItem: () => { throw new Error('chặn'); } };
    const store = new SaveStore(broken);
    expect(store.load()).toEqual(emptySave());
    const save = recordDay(emptySave(), A, day(4), HOTELS).save;
    expect(() => store.save(save)).not.toThrow();
    expect(store.load()).toEqual(save);
    expect(() => store.reset()).not.toThrow();
    expect(new SaveStore(null).load()).toEqual(emptySave());
  });
});
