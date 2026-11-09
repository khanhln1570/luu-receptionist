import { describe, expect, it } from 'vitest';
import { checkIn, checkOut, findReservations, normalize, type Reservation } from '../src/core/reservations';
import type { Room } from '../src/core/rooms';

const room = (over: Partial<Room> = {}): Room => ({
  id: '101',
  floor: 1,
  type: 'don',
  price: 100,
  status: 'vacant_clean',
  ...over,
});
const res = (over: Partial<Reservation> = {}): Reservation => ({
  id: 'r1',
  code: 'HM-001',
  guestName: 'Nguyễn Đức Anh',
  roomType: 'don',
  nights: 2,
  status: 'booked',
  ...over,
});

describe('tìm đặt phòng', () => {
  const list = [res(), res({ id: 'r2', code: 'HM-002', guestName: 'Trần Thị Bình' })];

  it('bỏ dấu tiếng Việt', () => {
    expect(normalize('Nguyễn Đức')).toBe('nguyen duc');
  });
  it('tìm theo tên không dấu, không phân biệt hoa thường', () => {
    expect(findReservations(list, 'nguyen duc').map((r) => r.id)).toEqual(['r1']);
    expect(findReservations(list, 'BINH').map((r) => r.id)).toEqual(['r2']);
  });
  it('tìm theo mã chính xác', () => {
    expect(findReservations(list, 'hm-002').map((r) => r.id)).toEqual(['r2']);
    expect(findReservations(list, 'hm-00')).toEqual([]);
  });
  it('chuỗi rỗng không khớp gì', () => {
    expect(findReservations(list, '  ')).toEqual([]);
  });
});

describe('check-in', () => {
  it('gán đúng phòng: phòng có khách, đặt phòng ghi roomId', () => {
    const r = room();
    const b = res();
    expect(checkIn(b, r)).toEqual({ ok: true });
    expect(r.status).toBe('occupied');
    expect(b.status).toBe('checked_in');
    expect(b.roomId).toBe('101');
  });
  it('chặn phòng sai loại', () => {
    const r = room({ type: 'doi' });
    const b = res();
    expect(checkIn(b, r).ok).toBe(false);
    expect(r.status).toBe('vacant_clean');
    expect(b.status).toBe('booked');
  });
  it('chặn phòng chưa dọn, đang có khách hoặc hỏng', () => {
    for (const status of ['dirty', 'occupied', 'broken', 'cleaning', 'repairing'] as const) {
      const r = room({ status });
      expect(checkIn(res(), r).ok).toBe(false);
      expect(r.status).toBe(status);
    }
  });
  it('chặn check-in hai lần và đặt phòng đã hủy', () => {
    const b = res();
    expect(checkIn(b, room()).ok).toBe(true);
    expect(checkIn(b, room({ id: '102' })).ok).toBe(false);
    expect(checkIn(res({ status: 'cancelled' }), room()).ok).toBe(false);
  });
});

describe('check-out', () => {
  it('phòng chuyển sang chưa dọn, đặt phòng đã trả', () => {
    const r = room();
    const b = res();
    checkIn(b, r);
    expect(checkOut(b, r)).toEqual({ ok: true });
    expect(r.status).toBe('dirty');
    expect(b.status).toBe('checked_out');
  });
  it('chặn khi chưa nhận phòng hoặc sai phòng', () => {
    expect(checkOut(res(), room()).ok).toBe(false);
    const b = res();
    checkIn(b, room());
    expect(checkOut(b, room({ id: '999', status: 'occupied' })).ok).toBe(false);
  });
});
