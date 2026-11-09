import type { Arrival } from './guests';
import { ROOM_TYPE_LABEL } from './labels';

/**
 * Lời chào của khách ở quầy. Id chẵn: khách đưa thông tin dễ tra (mã đặt phòng, số phòng).
 * Id lẻ: khách chỉ nói tên, người chơi phải tra sổ.
 */
export function greeting(a: Arrival): string {
  const even = (Number(a.id.slice(1)) || 0) % 2 === 0;
  if (a.kind === 'checkout') {
    return even && a.roomId
      ? `Chào bạn, tôi ở phòng ${a.roomId}, cho tôi trả phòng.`
      : `Chào bạn, tôi tên ${a.guestName}, tôi muốn trả phòng.`;
  }
  if (a.kind === 'checkin' && a.reservationCode && even) {
    return `Chào bạn, tôi đặt ${ROOM_TYPE_LABEL[a.roomType]}, mã đặt phòng là ${a.reservationCode}.`;
  }
  if (a.kind === 'checkin') {
    return `Chào bạn, tôi tên ${a.guestName}, tôi đã đặt ${ROOM_TYPE_LABEL[a.roomType]} từ trước.`;
  }
  if (a.kind === 'incident' || a.kind === 'overbooking' || a.kind === 'special') return `Xin chào, tôi là ${a.guestName}.`;
  return `Chào bạn, tôi chưa đặt trước, cho tôi thuê ${ROOM_TYPE_LABEL[a.roomType]}.`;
}
