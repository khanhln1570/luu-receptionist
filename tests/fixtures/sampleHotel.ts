import type { HotelConfig } from '../../src/core/game';
import type { Room, RoomType } from '../../src/core/rooms';

const room = (id: string, floor: number, type: RoomType, price: number, status: Room['status'] = 'vacant_clean'): Room => ({
  id,
  floor,
  type,
  price,
  status,
});

// Khách sạn mẫu; phòng 'occupied' là khách đang ở sẵn (một phần trả phòng hôm nay, phần còn lại ở tiếp).
export const SAMPLE_HOTEL: HotelConfig = {
  name: 'Khách sạn Hoa Mai',
  rooms: [
    room('101', 1, 'don', 250_000, 'dirty'),
    room('102', 1, 'don', 250_000),
    room('103', 1, 'don', 250_000, 'occupied'),
    room('104', 1, 'don', 250_000),
    room('105', 1, 'don', 250_000, 'occupied'),
    room('106', 1, 'don', 250_000),
    room('107', 1, 'don', 250_000),
    room('108', 1, 'don', 250_000),
    room('201', 2, 'don', 280_000),
    room('202', 2, 'don', 280_000, 'broken'),
    room('203', 2, 'don', 280_000, 'occupied'),
    room('204', 2, 'doi', 420_000, 'occupied'),
    room('205', 2, 'doi', 420_000),
    room('301', 3, 'doi', 450_000, 'occupied'),
    room('302', 3, 'doi', 450_000, 'occupied'),
    room('303', 3, 'doi', 450_000),
    room('306', 3, 'doi', 450_000),
    room('307', 3, 'doi', 450_000),
    room('304', 3, 'vip', 900_000),
    room('305', 3, 'vip', 900_000),
  ],
  staff: { housekeeping: 2, maintenance: 1 },
  taskMinutes: { cleaning: 30, repair: 90, service: 10, fix: 25 },
  params: {
    guestsPerDay: [6, 8],
    patienceMinutes: 25,
    walkInRate: 0.3,
    openMinute: 8 * 60,
    closeMinute: 22 * 60,
    incidentRate: 0.7,
    overbookingRate: 0.1,
    specialRate: 0.12,
  },
};
