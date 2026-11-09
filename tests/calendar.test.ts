import { describe, expect, it } from 'vitest';
import { dateOf, holdsNight } from '../src/core/calendar';
import { Game } from '../src/core/game';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

describe('dateOf', () => {
  it('ngày 1 là 01/06 (T2) và cộng ngày qua tháng', () => {
    expect(dateOf(1)).toEqual({ weekday: 'T2', text: '01/06' });
    expect(dateOf(1, 30)).toEqual({ weekday: 'T4', text: '01/07' });
    expect(dateOf(3, 2)).toEqual({ weekday: 'T6', text: '05/06' });
  });
});

describe('holdsNight', () => {
  it('giữ phòng các đêm từ ngày đến tới trước ngày đi; hủy hoặc trả phòng thì không giữ', () => {
    const r = { status: 'booked' as const, arrivalDay: 1, departDay: 3 };
    expect([0, 1, 2, 3].map((d) => holdsNight(r, d))).toEqual([false, true, true, false]);
    expect(holdsNight({ ...r, status: 'cancelled' }, 1)).toBe(false);
  });
});

describe('lịch đặt phòng của Game', () => {
  it('mọi đặt phòng có ngày đến/đi khớp số đêm; khách ở sẵn đã đến từ trước hoặc hôm nay', () => {
    const g = new Game(SAMPLE_HOTEL, 5);
    for (const r of [...g.reservations, ...g.futureBookings]) {
      expect(r.departDay! - r.arrivalDay!).toBe(r.nights);
    }
    for (const r of g.reservations.filter((x) => x.status === 'checked_in')) expect(r.arrivalDay!).toBeLessThanOrEqual(0);
  });
  it('đặt phòng tương lai bắt đầu từ ngày mai và không vượt số phòng mỗi đêm', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game(SAMPLE_HOTEL, seed);
      expect(g.futureBookings.length).toBeGreaterThan(0);
      for (const f of g.futureBookings) expect(f.arrivalDay!).toBeGreaterThanOrEqual(1);
      for (const row of g.calendar(7)) {
        for (let d = 1; d < 7; d++) expect(row.taken[d]!).toBeLessThanOrEqual(row.total);
      }
    }
  });
  it('khách trả phòng hôm nay không giữ phòng đêm nay; cùng seed ra cùng lịch', () => {
    const g = new Game(SAMPLE_HOTEL, 9);
    const leaving = g.reservations.filter((r) => r.status === 'checked_in' && r.departDay === 0);
    for (const r of leaving) expect(holdsNight(r, 0)).toBe(false);
    expect(new Game(SAMPLE_HOTEL, 9).calendar()).toEqual(g.calendar());
  });
  it('thêm lịch tương lai không làm đổi khách trong ngày', () => {
    const a = new Game(SAMPLE_HOTEL, 11);
    expect(a.queue.pendingCount).toBeGreaterThan(0);
    expect(a.reservations.every((r) => !r.code.startsWith('HM-F'))).toBe(true);
  });
});
