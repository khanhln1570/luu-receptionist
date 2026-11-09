import { describe, expect, it } from 'vitest';
import { formatMinute, GameClock } from '../src/core/clock';
import type { Arrival } from '../src/core/guests';
import { GuestQueue } from '../src/core/queue';

const arrival = (id: string, arrivalMinute: number, patienceMinutes = 10): Arrival => ({
  id,
  arrivalMinute,
  kind: 'walkin',
  guestName: id,
  personality: 'de_tinh',
  patienceMinutes,
  roomType: 'don',
});

describe('GameClock', () => {
  it('bắt đầu giờ mở cửa, định dạng HH:MM và dừng ở giờ đóng cửa', () => {
    const c = new GameClock(8 * 60, 9 * 60);
    expect(c.format()).toBe('08:00');
    c.advance(15);
    expect(c.format()).toBe('08:15');
    expect(c.isOver).toBe(false);
    c.advance(999);
    expect(c.minute).toBe(9 * 60);
    expect(c.isOver).toBe(true);
    expect(formatMinute(5 * 60 + 7)).toBe('05:07');
  });
});

describe('GuestQueue', () => {
  it('khách chỉ vào hàng khi đến giờ, theo thứ tự đến', () => {
    const q = new GuestQueue([arrival('b', 30), arrival('a', 10)]);
    expect(q.admit(5)).toEqual([]);
    expect(q.admit(10).map((g) => g.arrival.id)).toEqual(['a']);
    expect(q.hasPending).toBe(true);
    expect(q.admit(60).map((g) => g.arrival.id)).toEqual(['b']);
    expect(q.hasPending).toBe(false);
    expect(q.waiting.map((g) => g.arrival.id)).toEqual(['a', 'b']);
  });

  it('khách hết kiên nhẫn thì bỏ đi, phần còn lại ở lại', () => {
    const q = new GuestQueue([arrival('a', 0, 5), arrival('b', 0, 20)]);
    q.admit(0);
    expect(q.tick(3)).toEqual([]);
    const left = q.tick(2);
    expect(left.map((g) => g.arrival.id)).toEqual(['a']);
    expect(q.waiting.map((g) => g.arrival.id)).toEqual(['b']);
    expect(q.waiting[0]!.patienceLeft).toBe(15);
  });

  it('khách đang phục vụ không bị trừ kiên nhẫn; chỉ gọi khách mới khi xong việc', () => {
    const q = new GuestQueue([arrival('a', 0, 5), arrival('b', 0, 5)]);
    q.admit(0);
    const cur = q.callNext()!;
    expect(cur.arrival.id).toBe('a');
    expect(q.callNext()).toBeNull();
    const left = q.tick(10);
    expect(left.map((g) => g.arrival.id)).toEqual(['b']);
    expect(cur.patienceLeft).toBe(5);
    q.finishCurrent();
    expect(q.current).toBeNull();
    expect(q.callNext()).toBeNull();
  });
});
