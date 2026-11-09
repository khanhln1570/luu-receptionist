import { describe, expect, it } from 'vitest';
import { canTransition, findAvailable, transition, type Room, type RoomStatus } from '../src/core/rooms';

const room = (id: string, status: RoomStatus = 'vacant_clean', type: Room['type'] = 'don'): Room => ({
  id,
  floor: 1,
  type,
  price: 100,
  status,
});

describe('chuyển trạng thái phòng', () => {
  it('đi hết vòng: trống -> có khách -> chưa dọn -> đang dọn -> trống', () => {
    const r = room('101');
    for (const to of ['occupied', 'dirty', 'cleaning', 'vacant_clean'] as const) {
      expect(transition(r, to)).toEqual({ ok: true });
      expect(r.status).toBe(to);
    }
  });

  it('đi hết vòng hỏng: có khách -> hỏng -> đang sửa -> trống', () => {
    const r = room('102', 'occupied');
    for (const to of ['broken', 'repairing', 'vacant_clean'] as const) {
      expect(transition(r, to).ok).toBe(true);
    }
  });

  it('chặn chuyển trạng thái sai và giữ nguyên trạng thái', () => {
    const r = room('103', 'dirty');
    const res = transition(r, 'occupied');
    expect(res.ok).toBe(false);
    expect(r.status).toBe('dirty');
    expect(canTransition('repairing', 'occupied')).toBe(false);
    expect(canTransition('cleaning', 'dirty')).toBe(false);
  });
});

describe('findAvailable', () => {
  it('chỉ trả phòng sạch, trống, đúng loại', () => {
    const rooms = [
      room('1', 'vacant_clean', 'don'),
      room('2', 'dirty', 'don'),
      room('3', 'vacant_clean', 'doi'),
      room('4', 'occupied', 'don'),
      room('5', 'broken', 'don'),
    ];
    expect(findAvailable(rooms, 'don').map((r) => r.id)).toEqual(['1']);
    expect(findAvailable(rooms, 'vip')).toEqual([]);
  });
});
