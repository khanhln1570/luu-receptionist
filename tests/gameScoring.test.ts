import { describe, expect, it } from 'vitest';
import { Game, type HotelConfig } from '../src/core/game';
import { SCORE, computeDayResult } from '../src/core/scoring';
import { computeBill } from '../src/core/billing';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

const clean = SAMPLE_HOTEL.rooms.map((r) => ({ ...r, status: 'vacant_clean' as const }));
const oneGuest: HotelConfig = {
  ...SAMPLE_HOTEL,
  rooms: clean,
  params: { ...SAMPLE_HOTEL.params, guestsPerDay: [1, 1], walkInRate: 0, patienceMinutes: 100, incidentRate: 0, overbookingRate: 0, specialRate: 0 },
};
const threeGuests: HotelConfig = { ...oneGuest, params: { ...oneGuest.params, guestsPerDay: [3, 3], patienceMinutes: 20 } };
const idle: HotelConfig = { ...SAMPLE_HOTEL, params: { ...SAMPLE_HOTEL.params, guestsPerDay: [3, 3], patienceMinutes: 20 } };
const full: HotelConfig = { ...SAMPLE_HOTEL, params: { ...SAMPLE_HOTEL.params, guestsPerDay: [8, 8], patienceMinutes: 600 } };

function waitForGuest(game: Game) {
  while (game.queue.waiting.length === 0) game.tick(1);
}
/** Gọi khách vào quầy rồi nhận phòng đúng. */
function checkInRight(game: Game) {
  const guest = game.callNext()!;
  const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
  const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === res.roomType)!;
  return { guest, res, room, result: game.attemptCheckIn(res.id, room.id) };
}

describe('điểm từng khách', () => {
  it('chưa phục vụ khách nào thì hài lòng mặc định', () => {
    expect(new Game(oneGuest, 1).satisfaction).toBe(SCORE.defaultSatisfaction);
  });

  it('phục vụ ngay: điểm gốc', () => {
    const game = new Game(oneGuest, 1);
    waitForGuest(game);
    expect(checkInRight(game).result.ok).toBe(true);
    expect(game.guestScores).toEqual([SCORE.served]);
  });

  it('chờ hết nửa kiên nhẫn rồi mới được phục vụ thì bị trừ nửa điểm chờ', () => {
    const game = new Game(oneGuest, 1);
    waitForGuest(game);
    game.tick(game.queue.waiting[0]!.arrival.patienceMinutes / 2);
    checkInRight(game);
    expect(game.guestScores).toEqual([SCORE.served - SCORE.maxWaitPenalty / 2]);
  });

  it('khách đang ở quầy không bị trừ điểm chờ khi đang được phục vụ', () => {
    const game = new Game(oneGuest, 1);
    waitForGuest(game);
    game.callNext();
    game.tick(500); // người chơi loay hoay rất lâu
    const res = game.reservations[0]!;
    const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === res.roomType)!;
    game.attemptCheckIn(res.id, room.id);
    expect(game.guestScores).toEqual([SCORE.served]);
  });

  it('mỗi lần chọn sai bị trừ một sai sót; chọn đúng sau đó vẫn được ghi điểm', () => {
    const game = new Game(threeGuests, 3);
    waitForGuest(game);
    const guest = game.callNext()!;
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    const other = game.reservations.find((r) => r.id !== res.id)!;
    const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === res.roomType)!;
    const wrongType = game.rooms.find((r) => r.status === 'vacant_clean' && r.type !== res.roomType)!;
    expect(game.attemptCheckIn(other.id, room.id).ok).toBe(false); // nhầm đặt phòng
    expect(game.attemptCheckIn(res.id, wrongType.id).ok).toBe(false); // nhầm loại phòng
    expect(game.guestScores).toEqual([]); // chưa xong việc nên chưa ghi điểm
    expect(game.attemptCheckIn(res.id, room.id).ok).toBe(true);
    expect(game.guestScores).toEqual([SCORE.served - 2 * SCORE.mistakePenalty]);
  });

  it('sai sót của khách này không dồn sang khách sau', () => {
    const game = new Game(threeGuests, 3);
    waitForGuest(game);
    const first = game.callNext()!;
    const res = game.reservations.find((r) => r.code === first.arrival.reservationCode)!;
    const room = game.rooms.find((r) => r.status === 'vacant_clean' && r.type === res.roomType)!;
    game.attemptCheckIn('khong-co', room.id);
    game.attemptCheckIn(res.id, room.id);
    while (game.queue.waiting.length === 0) game.tick(1);
    checkInRight(game);
    expect(game.guestScores[1]).toBe(SCORE.served);
  });

  it('khách chờ quá lâu bỏ đi: điểm thấp và có sự kiện', () => {
    const game = new Game(threeGuests, 3);
    while (!game.isOver) game.tick(5);
    expect(game.guestScores).toEqual([SCORE.left, SCORE.left, SCORE.left]);
    expect(game.events.filter((e) => e.text.includes('bỏ đi'))).toHaveLength(3);
    expect(game.events.every((e) => e.kind === 'bad')).toBe(true);
  });

  it('từ chối khách: điểm thấp và có sự kiện', () => {
    const game = new Game(oneGuest, 1);
    waitForGuest(game);
    game.callNext();
    game.dismissCurrent();
    expect(game.guestScores).toEqual([SCORE.turnedAway]);
    expect(game.events[0]!.text).toContain('từ chối');
  });

  it('miễn phụ phí được cộng điểm và ghi sự kiện, thu đủ thì không', () => {
    let waived = 0;
    let charged = 0;
    for (let seed = 1; seed <= 60 && (!waived || !charged); seed++) {
      for (const waive of [true, false]) {
        const game = new Game(full, seed);
        let guest;
        while (!game.isOver) {
          waitForGuest(game);
          guest = game.callNext()!;
          if (guest.arrival.kind === 'checkout') break;
          game.queue.finishCurrent();
          guest = undefined;
        }
        if (!guest) continue;
        const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
        if (!res.charges?.length) continue;
        game.startCheckOut(res.id, res.roomId!);
        game.settleBill(waive);
        expect(game.guestScores).toEqual([waive ? SCORE.served + SCORE.waivedBonus : SCORE.served]);
        expect(game.events.some((e) => e.kind === 'good')).toBe(waive);
        if (waive) waived++;
        else charged++;
      }
    }
    expect(waived && charged).toBeTruthy();
  });
});

describe('kết quả cả ngày', () => {
  it('khách bỏ đi hết, không thu được đồng nào: 1 sao', () => {
    const game = new Game(idle, 3);
    expect(game.revenueTarget).toBeGreaterThan(0);
    while (!game.isOver) game.tick(5);
    expect(game.result).toMatchObject({ satisfaction: SCORE.left, revenueScore: 0, stars: 1 });
  });

  it('khớp công thức chấm điểm và tính cả khách chưa được phục vụ', () => {
    const game = new Game(threeGuests, 3);
    waitForGuest(game);
    checkInRight(game); // 1 khách xong
    while (game.queue.waiting.length === 0) game.tick(1);
    game.callNext(); // 1 khách đang ở quầy, không làm gì cho tới hết ngày
    game.queue.current!.patienceLeft = 20;
    while (!game.isOver) game.tick(60);
    expect(game.result).toEqual(
      computeDayResult({
        scores: game.guestScores,
        unservedGuests: game.queue.waiting.length + 1,
        revenue: game.stats.revenue,
        revenueTarget: game.revenueTarget,
      }),
    );
    expect(game.result.satisfaction).toBeLessThan(SCORE.served);
  });
});

describe('mục tiêu doanh thu theo từng ngày', () => {
  const pendingOf = (g: Game) => (g.queue as unknown as { pending: { kind: string; reservationCode?: string; roomId?: string }[] }).pending;

  it('bằng 80% tổng hóa đơn của các khách sẽ trả phòng hôm nay', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = new Game(full, seed);
      const total = pendingOf(game)
        .filter((a) => a.kind === 'checkout')
        .reduce((sum, a) => {
          const res = game.reservations.find((r) => r.code === a.reservationCode)!;
          return sum + computeBill(res, game.rooms.find((r) => r.id === a.roomId)!).total;
        }, 0);
      expect(game.revenueTarget).toBe(Math.round(0.8 * total));
    }
  });

  it('không có khách nào trả phòng thì mục tiêu bằng 0 và điểm doanh thu đầy đủ, không phải bị phạt', () => {
    const game = new Game(threeGuests, 3); // khách sạn không có khách ở sẵn
    expect(game.revenueTarget).toBe(0);
    while (!game.isOver) game.tick(5);
    expect(game.result.revenueScore).toBe(100);
  });

  it('thu đủ các hóa đơn thì đạt trọn điểm doanh thu', () => {
    const game = new Game(full, 5);
    while (!game.isOver) {
      while (game.queue.waiting.length === 0 && !game.isOver) game.tick(1);
      if (game.isOver) break;
      const guest = game.callNext()!;
      if (guest.arrival.kind === 'checkout') {
        const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
        game.startCheckOut(res.id, res.roomId!);
        game.settleBill(false);
      } else {
        game.queue.finishCurrent();
      }
    }
    expect(game.stats.revenue).toBeGreaterThanOrEqual(game.revenueTarget);
    expect(game.result.revenueScore).toBe(100);
  });
});
