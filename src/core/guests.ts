import type { Rng } from './rng';
import type { Reservation } from './reservations';
import type { RoomType } from './rooms';

export type Personality = 'kien_nhan' | 'de_tinh' | 'kho_tinh' | 'vip';
export type ArrivalKind = 'checkin' | 'walkin' | 'checkout' | 'incident' | 'overbooking' | 'special';

export interface Arrival {
  id: string;
  arrivalMinute: number;
  kind: ArrivalKind;
  guestName: string;
  personality: Personality;
  patienceMinutes: number;
  roomType: RoomType;
  reservationCode?: string; // có với kind = 'checkin' và 'checkout'
  roomId?: string; // phòng khách đang ở (checkout, incident)
  scenarioId?: string; // tình huống cần xử lý (incident, overbooking, special)
  regularId?: string; // khách quen (kind = 'special')
}

export interface DayParams {
  guestsPerDay: readonly [number, number];
  patienceMinutes: number;
  walkInRate: number;
  openMinute: number;
  closeMinute: number;
  incidentRate?: number; // xác suất khách đang ở (không trả phòng hôm nay) báo sự cố
  overbookingRate?: number; // xác suất khách đặt trước bị đặt trùng
  specialRate?: number; // xác suất khách đến là tình huống đặc biệt
  roomTypes?: readonly RoomType[]; // loại phòng khách sạn có; không có thì khách có thể đòi mọi loại
  nightShift?: boolean; // ca kéo tới sáng hôm sau: lễ tân phải ngủ, ban đêm có vài khách muộn
}

export interface DaySchedule {
  arrivals: Arrival[]; // sắp theo giờ đến
  reservations: Reservation[]; // đặt trước ứng với các khách checkin
}

export const PATIENCE_FACTOR: Record<Personality, number> = {
  kien_nhan: 1.5,
  de_tinh: 1.2,
  kho_tinh: 0.6,
  vip: 0.8,
};

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'] as const;
const DEM = ['Văn', 'Thị', 'Minh', 'Quốc', 'Ngọc', 'Hữu'] as const;
const TEN = ['Anh', 'Bình', 'Châu', 'Dũng', 'Hà', 'Khánh', 'Linh', 'Nam', 'Phúc', 'Trang'] as const;

export function randomPersonality(rng: Rng): Personality {
  return rng.weighted<Personality>([
    ['kien_nhan', 3],
    ['de_tinh', 3],
    ['kho_tinh', 3],
    ['vip', 1],
  ]);
}

export function randomName(rng: Rng): string {
  return `${rng.pick(HO)} ${rng.pick(DEM)} ${rng.pick(TEN)}`;
}

/** Các đợt khách trong ngày (tỉ lệ trong khoảng mở cửa → khách cuối) và trọng số: nhận phòng dồn vào chiều, tối có khách vãng lai. */
const RUSHES: readonly (readonly [number, number, number])[] = [
  [0.0, 0.2, 1], // sáng: đa phần trả phòng, ít khách mới
  [0.3, 0.55, 3], // đầu giờ nhận phòng: đông nhất
  [0.55, 0.8, 2], // chiều muộn
  [0.8, 1.0, 2], // tối: khách vãng lai
];
const BURST_CHANCE = 0.35; // đoàn đi cùng: khách đến sát nhau vài phút

/** Giờ đến của `count` khách: rơi vào các đợt cao điểm, và đôi khi hai ba khách đến liền nhau. Trả về đã sắp xếp. */
function arrivalTimes(rng: Rng, count: number, first: number, last: number): number[] {
  const span = last - first;
  const times: number[] = [];
  while (times.length < count) {
    const [a, b] = rng.weighted(RUSHES.map((r) => [r, r[2]] as const));
    const t = rng.int(first + Math.floor(span * a), first + Math.floor(span * b));
    times.push(t);
    if (times.length < count && rng.chance(BURST_CHANCE)) {
      times.push(Math.min(last, t + rng.int(2, 8)));
    }
  }
  return times.sort((x, y) => x - y);
}

/** Sinh lịch khách và đặt phòng cho một ngày. Cùng seed và tham số thì cho cùng kết quả. */
export function generateDay(rng: Rng, params: DayParams): DaySchedule {
  const count = rng.int(params.guestsPerDay[0], params.guestsPerDay[1]);
  // Khách đến muộn nhất 60 phút trước giờ đóng cửa để còn kịp phục vụ.
  const lastArrival = Math.max(params.openMinute, params.closeMinute - 60);
  const times = arrivalTimes(rng, count, params.openMinute, lastArrival);

  const arrivals: Arrival[] = [];
  const reservations: Reservation[] = [];

  times.forEach((arrivalMinute, i) => {
    const available = (t: RoomType) => !params.roomTypes || params.roomTypes.includes(t);
    let personality = randomPersonality(rng);
    // Khách sạn không có phòng VIP thì không có khách đòi phòng VIP.
    if (personality === 'vip' && !available('vip')) personality = 'de_tinh';
    const typeWeights = ([['don', 55], ['doi', 45]] as const).filter(([t]) => available(t));
    const roomType: RoomType =
      personality === 'vip' ? 'vip' : typeWeights.length ? rng.weighted(typeWeights) : params.roomTypes![0]!;
    let kind: ArrivalKind = 'checkin';
    if (params.specialRate && rng.chance(params.specialRate)) kind = 'special';
    else if (rng.chance(params.walkInRate)) kind = 'walkin';
    else if (params.overbookingRate && rng.chance(params.overbookingRate)) kind = 'overbooking';
    const guestName = randomName(rng);
    const arrival: Arrival = {
      id: `g${i + 1}`,
      arrivalMinute,
      kind,
      guestName,
      personality,
      patienceMinutes: Math.round(params.patienceMinutes * PATIENCE_FACTOR[personality]),
      roomType,
    };
    if (kind === 'checkin' || kind === 'overbooking') {
      const code = `HM-${String(i + 1).padStart(3, '0')}`;
      arrival.reservationCode = code;
      reservations.push({
        id: `r${i + 1}`,
        code,
        guestName,
        roomType,
        nights: rng.int(1, 3),
        status: 'booked',
      });
    }
    arrivals.push(arrival);
  });

  return { arrivals, reservations };
}
