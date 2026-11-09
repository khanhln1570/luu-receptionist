import { describe, expect, it } from 'vitest';
import { computeBill } from '../src/core/billing';
import { greeting } from '../src/core/dialogue';
import { Game, type HotelConfig } from '../src/core/game';
import type { Room } from '../src/core/rooms';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

/** Khách sạn không có khách ở sẵn, chỉ khách đặt trước. */
const config: HotelConfig = {
  ...SAMPLE_HOTEL,
  rooms: SAMPLE_HOTEL.rooms.map((r) => ({ ...r, status: 'vacant_clean' as const })),
  params: { ...SAMPLE_HOTEL.params, guestsPerDay: [3, 3], walkInRate: 0, patienceMinutes: 20 },
};
/** Khách sạn mẫu thật: có khách ở sẵn và walk-in. */
const full: HotelConfig = {
  ...SAMPLE_HOTEL,
  params: { ...SAMPLE_HOTEL.params, guestsPerDay: [8, 8], patienceMinutes: 600 },
};

/** Chạy tới khi có người trong hàng chờ rồi gọi khách vào quầy. */
function serveFirst(game: Game) {
  while (game.queue.waiting.length === 0 && !game.isOver) game.tick(1);
  return game.callNext()!;
}

/** Gọi lần lượt các khách cho tới khi gặp khách đúng loại; trả null nếu không có. */
function serveKind(game: Game, kind: 'checkin' | 'walkin' | 'checkout') {
  while (!game.isOver) {
    const g = serveFirst(game);
    if (!g) return null;
    if (g.arrival.kind === kind) return g;
    game.queue.finishCurrent(); // bỏ qua khách loại khác trong test
  }
  return null;
}

describe('Game: check-in', () => {
  it('cùng seed ra cùng lịch khách; không sửa cấu hình gốc', () => {
    const a = new Game(config, 9);
    const b = new Game(config, 9);
    expect(a.reservations).toEqual(b.reservations);
    a.rooms[0]!.status = 'occupied';
    expect(config.rooms[0]!.status).toBe('vacant_clean');
  });

  it('check-in đúng đặt phòng và phòng: tính khách, giải phóng quầy', () => {
    const game = new Game(config, 3);
    const guest = serveFirst(game);
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === res.roomType)!;
    expect(game.attemptCheckIn(res.id, room.id)).toEqual({ ok: true });
    expect(game.stats.checkedIn).toBe(1);
    expect(game.queue.current).toBeNull();
    expect(room.status).toBe('occupied');
  });

  it('chọn nhầm đặt phòng của khách khác thì bị chặn và không đổi gì', () => {
    const game = new Game(config, 3);
    const guest = serveFirst(game);
    const other = game.reservations.find((r) => r.code !== guest.arrival.reservationCode)!;
    const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === other.roomType)!;
    expect(game.attemptCheckIn(other.id, room.id).ok).toBe(false);
    expect(room.status).toBe('vacant_clean');
    expect(other.status).toBe('booked');
    expect(game.queue.current).toBe(guest);
  });

  it('phòng sai loại bị chặn; không có khách ở quầy thì báo lỗi', () => {
    const game = new Game(config, 3);
    expect(game.attemptCheckIn('r1', '102').ok).toBe(false);
    const guest = serveFirst(game);
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    const wrong = game.rooms.find((r) => r.status === 'vacant_clean' && r.type !== res.roomType)!;
    expect(game.attemptCheckIn(res.id, wrong.id).ok).toBe(false);
    expect(game.stats.checkedIn).toBe(0);
  });

  it('khách chờ quá lâu bỏ đi và được đếm; hết ngày thì dừng', () => {
    const game = new Game(config, 3);
    while (!game.isOver) game.tick(5);
    expect(game.stats.left).toBe(3);
    expect(game.unserved).toBe(0);
    expect(game.tick(10)).toEqual({ arrived: [], left: [], finished: [] });
  });
});

describe('Game: khách ở sẵn và trả phòng', () => {
  it('mỗi phòng có khách ở sẵn có một đặt phòng đang ở', () => {
    const game = new Game(full, 5);
    const occupied = full.rooms.filter((r) => r.status === 'occupied');
    const inHouse = game.reservations.filter((r) => r.status === 'checked_in');
    expect(inHouse.map((r) => r.roomId).sort()).toEqual(occupied.map((r) => r.id).sort());
    expect(inHouse.every((r) => r.nights >= 1)).toBe(true);
    expect(new Game(full, 5).reservations).toEqual(game.reservations);
  });

  it('trả phòng đúng: lập hóa đơn, thu tiền, phòng chuyển chưa dọn', () => {
    const game = new Game(full, 5);
    const guest = serveKind(game, 'checkout')!;
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    const room = game.rooms.find((r) => r.id === res.roomId)!;
    expect(game.startCheckOut(res.id, room.id)).toEqual({ ok: true });
    const bill = game.billing!;
    expect(bill.base).toBe(res.nights * room.price);
    expect(game.stats.revenue).toBe(0); // chưa thu
    expect(game.settleBill(false)).toEqual({ ok: true });
    expect(game.stats.revenue).toBe(bill.total);
    expect(game.stats.checkedOut).toBe(1);
    expect(room.status).toBe('dirty');
    expect(res.status).toBe('checked_out');
    expect(game.billing).toBeNull();
    expect(game.queue.current).toBeNull();
  });

  it('miễn phụ phí: chỉ thu tiền phòng, ghi lại số tiền đã miễn', () => {
    // thử vài seed để có khách có phụ phí
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Game(full, seed);
      const guest = serveKind(game, 'checkout');
      if (!guest) continue;
      const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
      if (!res.charges?.length) continue;
      game.startCheckOut(res.id, res.roomId!);
      const bill = game.billing!;
      expect(bill.chargesTotal).toBeGreaterThan(0);
      game.settleBill(true);
      expect(game.stats.revenue).toBe(bill.base);
      expect(game.stats.waived).toBe(bill.chargesTotal);
      return;
    }
    throw new Error('không tìm thấy khách có phụ phí trong 40 seed');
  });

  it('chọn nhầm đặt phòng hoặc nhầm phòng thì bị chặn, chưa lập hóa đơn', () => {
    const game = new Game(full, 5);
    const guest = serveKind(game, 'checkout')!;
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    const other = game.reservations.find((r) => r.status === 'checked_in' && r.id !== res.id)!;
    expect(game.startCheckOut(other.id, other.roomId!).ok).toBe(false);
    expect(game.startCheckOut(res.id, other.roomId!).ok).toBe(false);
    expect(game.billing).toBeNull();
    expect(game.queue.current).toBe(guest);
  });

  it('không thu được khi chưa có hóa đơn; hủy hóa đơn thì khách vẫn ở quầy', () => {
    const game = new Game(full, 5);
    expect(game.settleBill(false).ok).toBe(false);
    const guest = serveKind(game, 'checkout')!;
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    game.startCheckOut(res.id, res.roomId!);
    game.cancelBill();
    expect(game.billing).toBeNull();
    expect(game.queue.current).toBe(guest);
    expect(game.stats.checkedOut).toBe(0);
  });

  it('khách trả phòng không thể bị từ chối; dùng sai loại thao tác thì báo lỗi', () => {
    const game = new Game(full, 5);
    serveKind(game, 'checkout');
    expect(game.dismissCurrent().ok).toBe(false);
    expect(game.attemptCheckIn('r1', '102').ok).toBe(false);
    expect(game.attemptWalkIn('102').ok).toBe(false);
  });
});

describe('Game: khách walk-in', () => {
  it('chọn phòng trống đúng loại: tạo đặt phòng và cho nhận phòng', () => {
    const game = new Game(full, 5);
    const guest = serveKind(game, 'walkin')!;
    const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === guest.arrival.roomType)!;
    const before = game.reservations.length;
    expect(game.attemptWalkIn(room.id)).toEqual({ ok: true });
    expect(room.status).toBe('occupied');
    expect(game.reservations.length).toBe(before + 1);
    const created = game.reservations.at(-1)!;
    expect(created.guestName).toBe(guest.arrival.guestName);
    expect(created.roomId).toBe(room.id);
    expect(game.stats.checkedIn).toBe(1);
  });

  it('phòng sai loại hoặc chưa dọn bị chặn và không tạo đặt phòng', () => {
    const game = new Game(full, 5);
    const guest = serveKind(game, 'walkin')!;
    const wrongType = game.rooms.find((r) => r.status === 'vacant_clean' && r.type !== guest.arrival.roomType)!;
    const dirty = game.rooms.find((r): r is Room => r.status === 'dirty' && r.type === guest.arrival.roomType);
    const before = game.reservations.length;
    expect(game.attemptWalkIn(wrongType.id).ok).toBe(false);
    if (dirty) expect(game.attemptWalkIn(dirty.id).ok).toBe(false);
    expect(game.reservations.length).toBe(before);
    expect(game.queue.current).toBe(guest);
  });

  it('có thể từ chối khách đến nhận phòng và được đếm', () => {
    const game = new Game(full, 5);
    serveKind(game, 'walkin');
    expect(game.dismissCurrent()).toEqual({ ok: true });
    expect(game.stats.turnedAway).toBe(1);
    expect(game.queue.current).toBeNull();
  });
});

describe('computeBill', () => {
  it('tiền phòng = số đêm × giá, cộng phụ phí', () => {
    const room: Room = { id: '1', floor: 1, type: 'don', price: 200_000, status: 'occupied' };
    const res = { id: 'r', code: 'C', guestName: 'A', roomType: 'don', nights: 3, status: 'checked_in', charges: [{ label: 'x', amount: 50_000 }, { label: 'y', amount: 30_000 }] } as const;
    const bill = computeBill({ ...res, charges: [...res.charges] }, room);
    expect(bill.base).toBe(600_000);
    expect(bill.chargesTotal).toBe(80_000);
    expect(bill.total).toBe(680_000);
  });
});

describe('greeting', () => {
  const base = { arrivalMinute: 0, guestName: 'Lê Văn Nam', personality: 'de_tinh', patienceMinutes: 10, roomType: 'don' } as const;
  it('khách đặt trước nói tên hoặc đọc mã tuỳ id', () => {
    const a = { ...base, kind: 'checkin', reservationCode: 'HM-002' } as const;
    expect(greeting({ ...a, id: 'g2' })).toContain('HM-002');
    expect(greeting({ ...a, id: 'g3' })).toContain('Lê Văn Nam');
  });
  it('khách trả phòng nói số phòng hoặc chỉ tên', () => {
    const a = { ...base, kind: 'checkout', reservationCode: 'HM-H01', roomId: '103' } as const;
    expect(greeting({ ...a, id: 'c2' })).toContain('103');
    expect(greeting({ ...a, id: 'c1' })).toContain('Lê Văn Nam');
  });
  it('khách vãng lai nói rõ chưa đặt trước', () => {
    expect(greeting({ ...base, id: 'g1', kind: 'walkin' })).toContain('chưa đặt trước');
  });
});
