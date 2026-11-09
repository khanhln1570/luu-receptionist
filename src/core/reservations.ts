import { fail, ok, type Result } from './result';
import { transition, type Room, type RoomType } from './rooms';

export type ReservationStatus = 'booked' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface ExtraCharge {
  label: string;
  amount: number;
}

export interface Reservation {
  id: string;
  code: string; // mã đặt phòng khách đọc ở quầy
  guestName: string;
  roomType: RoomType;
  nights: number;
  status: ReservationStatus;
  roomId?: string; // có sau khi check-in
  arrivalDay?: number; // ngày đến, tính từ hôm nay = 0 (âm nếu đã đến từ trước)
  departDay?: number; // ngày đi = ngày đến + số đêm
  charges?: ExtraCharge[]; // phụ phí phát sinh trong lúc ở (minibar, hỏng đồ...)
}

/** Bỏ dấu tiếng Việt và hạ chữ thường để tìm kiếm: "Nguyễn Đức" -> "nguyen duc". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

/** Tìm theo mã đặt phòng (khớp chính xác) hoặc theo tên (chứa chuỗi, không phân biệt dấu). */
export function findReservations(list: readonly Reservation[], query: string): Reservation[] {
  const q = normalize(query);
  if (!q) return [];
  return list.filter((r) => normalize(r.code) === q || normalize(r.guestName).includes(q));
}

export function checkIn(res: Reservation, room: Room): Result {
  if (res.status !== 'booked') return fail(`Đặt phòng ${res.code} không ở trạng thái chờ nhận phòng (${res.status})`);
  if (room.type !== res.roomType) return fail(`Phòng ${room.id} là loại ${room.type}, khách đặt ${res.roomType}`);
  if (room.status !== 'vacant_clean') return fail(`Phòng ${room.id} chưa sẵn sàng (${room.status})`);
  const moved = transition(room, 'occupied');
  if (!moved.ok) return moved;
  res.status = 'checked_in';
  res.roomId = room.id;
  return ok;
}

export function checkOut(res: Reservation, room: Room): Result {
  if (res.status !== 'checked_in') return fail(`Đặt phòng ${res.code} chưa nhận phòng (${res.status})`);
  if (res.roomId !== room.id) return fail(`Khách ${res.guestName} không ở phòng ${room.id}`);
  const moved = transition(room, 'dirty');
  if (!moved.ok) return moved;
  res.status = 'checked_out';
  return ok;
}
