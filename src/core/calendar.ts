import type { Reservation } from './reservations';
import type { RoomType } from './rooms';

/** Ngày đầu tiên của chuỗi ngày chơi (ngày game số 1). */
export const START_DATE = new Date(2026, 5, 1);
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export interface DateInfo {
  weekday: string; // T2..CN
  text: string; // dd/mm
}

/** Ngày lịch của ngày game `day` (bắt đầu từ 1), cộng thêm `offset` ngày. */
export function dateOf(day: number, offset = 0): DateInfo {
  const d = new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate() + day - 1 + offset);
  return { weekday: WEEKDAYS[d.getDay()]!, text: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
}

export interface CalendarRow {
  type: RoomType;
  total: number; // số phòng loại này
  taken: number[]; // số phòng bị giữ mỗi đêm, bắt đầu từ đêm hôm nay
}

/** Một đặt phòng giữ phòng vào đêm `d` (tính từ hôm nay = 0) khi đến ≤ d < đi. */
export function holdsNight(r: Pick<Reservation, 'status' | 'arrivalDay' | 'departDay'>, d: number): boolean {
  return (r.status === 'booked' || r.status === 'checked_in') && r.arrivalDay !== undefined && r.departDay !== undefined && r.arrivalDay <= d && d < r.departDay;
}

export function buildCalendar(
  types: readonly RoomType[],
  totals: Record<RoomType, number>,
  reservations: readonly Reservation[],
  days: number,
): CalendarRow[] {
  return types
    .filter((t) => totals[t] > 0)
    .map((type) => ({
      type,
      total: totals[type],
      taken: Array.from({ length: days }, (_, d) => reservations.filter((r) => r.roomType === type && holdsNight(r, d)).length),
    }));
}
