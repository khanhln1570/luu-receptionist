import type { ExtraCharge, Reservation } from './reservations';
import type { Room } from './rooms';

export interface Bill {
  reservationId: string;
  roomId: string;
  guestName: string;
  nights: number;
  nightlyRate: number;
  base: number; // tiền phòng
  charges: ExtraCharge[];
  chargesTotal: number; // tổng phụ phí
  total: number; // base + chargesTotal
}

export function computeBill(res: Reservation, room: Room): Bill {
  const charges = res.charges ?? [];
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const base = res.nights * room.price;
  return {
    reservationId: res.id,
    roomId: room.id,
    guestName: res.guestName,
    nights: res.nights,
    nightlyRate: room.price,
    base,
    charges,
    chargesTotal,
    total: base + chargesTotal,
  };
}
