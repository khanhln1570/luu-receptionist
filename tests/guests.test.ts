import { describe, expect, it } from 'vitest';
import { generateDay, type DayParams } from '../src/core/guests';
import { Rng } from '../src/core/rng';

const params: DayParams = {
  guestsPerDay: [6, 8],
  patienceMinutes: 20,
  walkInRate: 0.3,
  openMinute: 8 * 60,
  closeMinute: 22 * 60,
};

describe('Rng', () => {
  it('cùng seed cho cùng dãy số, khác seed cho dãy khác', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => new Rng(43).next())).not.toEqual(seqA);
  });
  it('int nằm trong khoảng, gồm cả hai đầu', () => {
    const r = new Rng(1);
    const seen = new Set(Array.from({ length: 500 }, () => r.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
  it('weighted không chọn mục trọng số 0', () => {
    const r = new Rng(7);
    const picks = Array.from({ length: 200 }, () => r.weighted([['a', 1], ['b', 0]] as const));
    expect(new Set(picks)).toEqual(new Set(['a']));
  });
});

describe('generateDay', () => {
  it('cùng seed ra cùng lịch khách', () => {
    expect(generateDay(new Rng(123), params)).toEqual(generateDay(new Rng(123), params));
  });
  it('khác seed ra lịch khác', () => {
    expect(generateDay(new Rng(1), params)).not.toEqual(generateDay(new Rng(2), params));
  });
  it('số khách, giờ đến nằm trong giới hạn và đã sắp xếp', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { arrivals } = generateDay(new Rng(seed), params);
      expect(arrivals.length).toBeGreaterThanOrEqual(6);
      expect(arrivals.length).toBeLessThanOrEqual(8);
      const times = arrivals.map((a) => a.arrivalMinute);
      expect(times).toEqual([...times].sort((x, y) => x - y));
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(params.openMinute);
        expect(t).toBeLessThanOrEqual(params.closeMinute - 60);
      }
    }
  });
  it('khách checkin có đặt phòng khớp tên, loại phòng và mã; walk-in thì không', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { arrivals, reservations } = generateDay(new Rng(seed), params);
      for (const a of arrivals) {
        const res = reservations.find((r) => r.code === a.reservationCode);
        if (a.kind === 'checkin') {
          expect(res).toBeDefined();
          expect(res!.guestName).toBe(a.guestName);
          expect(res!.roomType).toBe(a.roomType);
          expect(res!.status).toBe('booked');
        } else {
          expect(a.reservationCode).toBeUndefined();
        }
      }
      expect(reservations.length).toBe(arrivals.filter((a) => a.kind === 'checkin').length);
    }
  });
  it('khách VIP ở phòng vip và ít kiên nhẫn hơn khách kiên nhẫn', () => {
    const all = Array.from({ length: 80 }, (_, s) => generateDay(new Rng(s + 1), params).arrivals).flat();
    const vip = all.filter((a) => a.personality === 'vip');
    const patient = all.filter((a) => a.personality === 'kien_nhan');
    expect(vip.length).toBeGreaterThan(0);
    expect(vip.every((a) => a.roomType === 'vip' && a.patienceMinutes === 16)).toBe(true);
    expect(patient.every((a) => a.patienceMinutes === 30)).toBe(true);
  });
  it('walkInRate 0 thì toàn khách đặt trước, 1 thì toàn walk-in', () => {
    expect(generateDay(new Rng(5), { ...params, walkInRate: 0 }).arrivals.every((a) => a.kind === 'checkin')).toBe(true);
    const walkOnly = generateDay(new Rng(5), { ...params, walkInRate: 1 });
    expect(walkOnly.arrivals.every((a) => a.kind === 'walkin')).toBe(true);
    expect(walkOnly.reservations).toEqual([]);
  });
});
