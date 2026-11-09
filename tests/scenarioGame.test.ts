import { describe, expect, it } from 'vitest';
import type { Arrival } from '../src/core/guests';
import { Game, type HotelConfig } from '../src/core/game';
import type { Scenario } from '../src/core/scenarios';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

const scenarios: Scenario[] = [
  {
    id: 'inc',
    type: 'incident',
    lines: ['{ten} ở phòng {phong}.'],
    options: [
      { text: 'Phục vụ', result: 'ok', effects: { task: 'service', satisfaction: 5 } },
      { text: 'Đổi phòng', result: 'đổi', requires: 'spareRoom', effects: { moveRoom: 'same', oldRoom: 'broken', satisfaction: 8 } },
      { text: 'Mặc kệ', result: 'tệ', effects: { satisfaction: -10 } },
    ],
  },
  {
    id: 'ob',
    type: 'overbooking',
    lines: ['Hết {loai}.'],
    options: [
      { text: 'Nâng hạng', result: 'lên', requires: 'upgradeRoom', effects: { checkIn: 'upgrade', satisfaction: 10 } },
      { text: 'Hạ hạng', result: 'xuống', requires: 'lowerRoom', effects: { checkIn: 'lower', money: -100_000, satisfaction: -3 } },
      { text: 'Hủy', result: 'hủy', effects: { cancel: true, money: -200_000, satisfaction: -8 } },
    ],
  },
  {
    id: 'sp',
    type: 'special',
    lines: ['Hỏi đường.'],
    options: [
      { text: 'Giúp', result: 'cảm ơn', effects: { satisfaction: 5, money: 20_000 } },
      { text: 'Kệ', result: 'buồn', effects: { satisfaction: -30 } },
      { text: 'Tuyệt vời', result: 'wow', effects: { satisfaction: 20 } },
    ],
  },
];

const hotel = (rates: { incidentRate?: number; overbookingRate?: number; specialRate?: number }, walkInRate = 0): HotelConfig => ({
  ...SAMPLE_HOTEL,
  params: { ...SAMPLE_HOTEL.params, guestsPerDay: [8, 8], patienceMinutes: 9999, walkInRate, incidentRate: 0, overbookingRate: 0, specialRate: 0, ...rates },
});

const pendingOf = (g: Game) => (g.queue as unknown as { pending: Arrival[] }).pending;

/** Tìm seed và gọi khách đúng loại (và điều kiện) vào quầy. */
function serve(config: HotelConfig, kind: Arrival['kind'], where: (a: Arrival) => boolean = () => true): Game {
  for (let seed = 1; seed <= 200; seed++) {
    const game = new Game(config, seed, scenarios);
    if (!pendingOf(game).some((a) => a.kind === kind && where(a))) continue;
    while (!game.isOver) {
      game.tick(1);
      const w = game.queue.waiting.find((x) => x.arrival.kind === kind && where(x.arrival));
      if (!w) continue;
      game.queue.waiting.splice(game.queue.waiting.indexOf(w), 1);
      game.queue.current = w;
      return game;
    }
  }
  throw new Error(`không tìm thấy khách ${kind}`);
}

describe('sinh khách tình huống', () => {
  it('cùng seed ra cùng lịch kể cả tình huống; chỉ tình huống có kịch bản mới được gán', () => {
    const cfg = hotel({ incidentRate: 1, overbookingRate: 1, specialRate: 0.5 });
    const a = pendingOf(new Game(cfg, 7, scenarios));
    expect(pendingOf(new Game(cfg, 7, scenarios))).toEqual(a);
    for (const x of a) {
      if (['incident', 'overbooking', 'special'].includes(x.kind)) expect(x.scenarioId).toBeDefined();
      else expect(x.scenarioId).toBeUndefined();
    }
  });
  it('không có kịch bản thì không sinh khách tình huống dù tỉ lệ cao', () => {
    const cfg = hotel({ incidentRate: 1, overbookingRate: 1, specialRate: 1 });
    for (let seed = 1; seed <= 20; seed++) {
      const kinds = pendingOf(new Game(cfg, seed)).map((a) => a.kind);
      expect(kinds.every((k) => ['checkin', 'walkin', 'checkout'].includes(k))).toBe(true);
    }
  });
  it('khách sự cố là khách đang ở và nằm trong phòng có khách', () => {
    const cfg = hotel({ incidentRate: 1 });
    const game = new Game(cfg, 3, scenarios);
    const incidents = pendingOf(game).filter((a) => a.kind === 'incident');
    expect(incidents.length).toBeGreaterThan(0);
    for (const a of incidents) {
      expect(game.rooms.find((r) => r.id === a.roomId)!.status).toBe('occupied');
      expect(game.reservations.find((r) => r.code === a.reservationCode)!.status).toBe('checked_in');
    }
  });
});

describe('sự cố', () => {
  const cfg = hotel({ incidentRate: 1 });

  it('hiện lời thoại đã thay biến và các lựa chọn', () => {
    const game = serve(cfg, 'incident');
    const a = game.queue.current!.arrival;
    const view = game.currentScenario()!;
    expect(view.lines[0]).toBe(`${a.guestName} ở phòng ${a.roomId}.`);
    expect(view.options.map((o) => o.text)).toEqual(['Phục vụ', 'Đổi phòng', 'Mặc kệ']);
  });

  it('giao việc phục vụ: tăng hài lòng, buồng phòng bận, phòng vẫn có khách, khách rời quầy', () => {
    const game = serve(cfg, 'incident');
    const roomId = game.queue.current!.arrival.roomId!;
    const result = game.chooseOption(0);
    expect(result).toEqual({ ok: true, message: 'ok', satisfaction: 5 });
    expect(game.guestScores).toEqual([72.5]); // 60 + 5 × 2,5
    expect(game.tasks.taskFor(roomId)?.kind).toBe('service');
    expect(game.rooms.find((r) => r.id === roomId)!.status).toBe('occupied');
    expect(game.queue.current).toBeNull();
    expect(game.stats.scenarios).toBe(1);
  });

  it('đổi phòng: khách sang phòng trống cùng loại, phòng cũ hỏng', () => {
    const game = serve(cfg, 'incident');
    const a = game.queue.current!.arrival;
    const res = game.reservations.find((r) => r.code === a.reservationCode)!;
    const oldId = res.roomId!;
    const spare = game.rooms.filter((r) => r.status === 'vacant_clean' && r.type === a.roomType).map((r) => r.id).sort()[0]!;
    expect(game.chooseOption(1).ok).toBe(true);
    expect(res.roomId).toBe(spare);
    expect(game.rooms.find((r) => r.id === spare)!.status).toBe('occupied');
    expect(game.rooms.find((r) => r.id === oldId)!.status).toBe('broken');
    expect(game.guestScores).toEqual([80]); // 60 + 8 × 2,5
  });

  it('hết phòng cùng loại thì lựa chọn đổi phòng bị khóa và không làm gì', () => {
    const game = serve(cfg, 'incident');
    const a = game.queue.current!.arrival;
    for (const r of game.rooms) if (r.type === a.roomType && r.status === 'vacant_clean') r.status = 'dirty';
    const view = game.currentScenario()!;
    expect(view.options[1]).toMatchObject({ enabled: false, reason: 'Không còn phòng phù hợp' });
    expect(view.options[0]!.enabled).toBe(true);
    const before = game.rooms.map((r) => r.status);
    expect(game.chooseOption(1).ok).toBe(false);
    expect(game.rooms.map((r) => r.status)).toEqual(before);
    expect(game.queue.current).not.toBeNull();
    expect(game.guestScores).toEqual([]);
    expect(game.satisfaction).toBe(70);
  });

  it('khách sự cố không thể bị từ chối và không dùng được thao tác nhận phòng', () => {
    const game = serve(cfg, 'incident');
    expect(game.dismissCurrent().ok).toBe(false);
    expect(game.attemptCheckIn('h1', '102').ok).toBe(false);
    expect(game.chooseOption(9).ok).toBe(false);
  });
});

describe('overbooking', () => {
  const cfg = hotel({ overbookingRate: 1 });

  it('đặt phòng tồn tại nhưng không nhận phòng thường được; nâng hạng nhận phòng loại cao hơn', () => {
    const game = serve(cfg, 'overbooking', (a) => a.roomType === 'don');
    const a = game.queue.current!.arrival;
    const res = game.reservations.find((r) => r.code === a.reservationCode)!;
    expect(res.status).toBe('booked');
    expect(game.attemptCheckIn(res.id, '102').ok).toBe(false);
    expect(game.chooseOption(0).ok).toBe(true);
    expect(res.status).toBe('checked_in');
    const room = game.rooms.find((r) => r.id === res.roomId)!;
    expect(room.type).toBe('doi');
    expect(room.status).toBe('occupied');
    expect(game.stats.checkedIn).toBe(1);
    expect(game.guestScores).toEqual([85 - 8]); // 60 + 10 × 2,5, trừ 1 sai sót vì thử nhận phòng thường ở trên
  });

  it('hạ hạng: không có loại thấp hơn cho phòng đơn thì khóa; phòng đôi hạ xuống phòng đơn, giảm giá', () => {
    const don = serve(cfg, 'overbooking', (a) => a.roomType === 'don');
    expect(don.currentScenario()!.options[1]!.enabled).toBe(false);
    const doi = serve(cfg, 'overbooking', (a) => a.roomType === 'doi');
    const res = doi.reservations.find((r) => r.code === doi.queue.current!.arrival.reservationCode)!;
    expect(doi.chooseOption(1).ok).toBe(true);
    expect(doi.rooms.find((r) => r.id === res.roomId)!.type).toBe('don');
    expect(doi.stats.revenue).toBe(-100_000);
  });

  it('hết phòng loại cao thì vẫn hủy được: đặt phòng hủy, khách bị đếm là từ chối, bồi thường trừ doanh thu', () => {
    const game = serve(cfg, 'overbooking', (a) => a.roomType === 'vip');
    expect(game.currentScenario()!.options[0]!.enabled).toBe(false);
    const res = game.reservations.find((r) => r.code === game.queue.current!.arrival.reservationCode)!;
    expect(game.chooseOption(2).ok).toBe(true);
    expect(res.status).toBe('cancelled');
    expect(game.stats.turnedAway).toBe(1);
    expect(game.stats.revenue).toBe(-200_000);
    expect(game.guestScores).toEqual([40]); // 60 − 8 × 2,5
  });
});

describe('tình huống đặc biệt', () => {
  const cfg = hotel({ specialRate: 1 });

  it('áp dụng tiền và hài lòng, không đụng tới phòng', () => {
    const game = serve(cfg, 'special');
    const before = game.rooms.map((r) => r.status);
    expect(game.chooseOption(0)).toEqual({ ok: true, message: 'cảm ơn', satisfaction: 5 });
    expect(game.stats.revenue).toBe(20_000);
    expect(game.guestScores).toEqual([72.5]);
    expect(game.rooms.map((r) => r.status)).toEqual(before);
  });

  it('điểm của một khách bị chặn trong khoảng 0..100', () => {
    const low = serve(cfg, 'special');
    low.chooseOption(1); // 60 − 75 = −15
    expect(low.guestScores).toEqual([0]);
    const high = serve(cfg, 'special');
    high.chooseOption(2); // 60 + 50 = 110
    expect(high.guestScores).toEqual([100]);
  });
});

describe('chọn tình huống trong ngày', () => {
  it('không lặp tình huống cùng loại khi kho còn đủ', () => {
    const many: Scenario[] = Array.from({ length: 12 }, (_, i) => ({ ...scenarios[2]!, id: `sp${i}` }));
    const cfg = hotel({ specialRate: 1 });
    for (let seed = 1; seed <= 20; seed++) {
      const ids = pendingOf(new Game(cfg, seed, many))
        .filter((a) => a.kind === 'special')
        .map((a) => a.scenarioId);
      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
