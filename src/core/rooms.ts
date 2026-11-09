import { fail, ok, type Result } from './result';

export type RoomType = 'don' | 'doi' | 'vip';

export type RoomStatus =
  | 'vacant_clean' // trống, sạch: gán được cho khách
  | 'occupied' // có khách
  | 'dirty' // chưa dọn
  | 'cleaning' // đang dọn
  | 'broken' // hỏng, chờ bảo trì
  | 'repairing'; // đang sửa

export interface Room {
  id: string;
  floor: number;
  type: RoomType;
  price: number;
  status: RoomStatus;
}

const TRANSITIONS: Record<RoomStatus, readonly RoomStatus[]> = {
  vacant_clean: ['occupied', 'broken'],
  occupied: ['dirty', 'broken'],
  dirty: ['cleaning'],
  cleaning: ['vacant_clean'],
  broken: ['repairing'],
  repairing: ['vacant_clean'],
};

export function canTransition(from: RoomStatus, to: RoomStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Đổi trạng thái phòng nếu hợp lệ; ngược lại giữ nguyên và trả lỗi. */
export function transition(room: Room, to: RoomStatus): Result {
  if (!canTransition(room.status, to)) {
    return fail(`Phòng ${room.id}: không thể chuyển từ ${room.status} sang ${to}`);
  }
  room.status = to;
  return ok;
}

/** Phòng sẵn sàng đón khách: sạch, trống, đúng loại. */
export function findAvailable(rooms: readonly Room[], type: RoomType): Room[] {
  return rooms.filter((r) => r.status === 'vacant_clean' && r.type === type);
}
