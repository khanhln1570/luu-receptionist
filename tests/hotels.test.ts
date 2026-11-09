import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { buildRooms, parseHotels } from '../src/core/hotels';
import { validateScenarios } from '../src/core/scenarios';
import { HOTELS } from '../src/data/hotels';
import scenarioData from '../src/data/scenarios.json';

const good = {
  id: 'a',
  name: 'A',
  unlock: { requires: null },
  goal: { days: 2, minStars: 3 },
  roomGroups: [{ floor: 1, type: 'don', count: 3, price: 100000 }],
  staff: { housekeeping: 1, maintenance: 1 },
  difficulty: { guestsPerDay: [2, 3], patienceMinutes: 20 },
};
const bad = (patch: object) => [{ ...good, ...patch }];

describe('buildRooms', () => {
  it('đánh số theo tầng liên tục kể cả qua nhiều nhóm, gán trạng thái theo thứ tự có khách, chưa dọn, hỏng', () => {
    const rooms = buildRooms([
      { floor: 1, type: 'don', count: 5, price: 1, occupied: 1, dirty: 1, broken: 1 },
      { floor: 2, type: 'don', count: 1, price: 1 },
      { floor: 2, type: 'doi', count: 2, price: 2 },
    ]);
    expect(rooms.map((r) => r.id)).toEqual(['101', '102', '103', '104', '105', '201', '202', '203']);
    expect(rooms.slice(0, 5).map((r) => r.status)).toEqual(['occupied', 'dirty', 'broken', 'vacant_clean', 'vacant_clean']);
    expect(rooms.slice(5).every((r) => r.status === 'vacant_clean')).toBe(true);
    expect(rooms.map((r) => r.type).slice(5)).toEqual(['don', 'doi', 'doi']);
  });
});

describe('khách sạn thật trong data/hotels', () => {
  it('có 3 khách sạn nhỏ, vừa, lớn nối thành một chuỗi mở khóa bắt đầu từ khách sạn mở sẵn', () => {
    expect(HOTELS).toHaveLength(3);
    const sizes = HOTELS.map((h) => h.config.rooms.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(3);
    expect(HOTELS[0]!.requires).toBeNull();
    expect(HOTELS[1]!.requires).toBe(HOTELS[0]!.id);
    expect(HOTELS[2]!.requires).toBe(HOTELS[1]!.id);
  });
  it('số phòng duy nhất, độ khó tăng dần theo cấp', () => {
    for (const h of HOTELS) {
      const ids = h.config.rooms.map((r) => r.id);
      expect(new Set(ids).size, h.id).toBe(ids.length);
    }
    const guests = HOTELS.map((h) => h.config.params.guestsPerDay[1]);
    expect(guests).toEqual([...guests].sort((a, b) => a - b));
  });
  it('khách sạn nhỏ chỉ có phòng đơn và đôi, nên không bao giờ có khách đòi phòng VIP', () => {
    const small = HOTELS[0]!;
    expect(small.config.rooms.some((r) => r.type === 'vip')).toBe(false);
    const scenarios = validateScenarios(scenarioData);
    for (let seed = 1; seed <= 100; seed++) {
      const game = new Game(small.config, seed, scenarios);
      const pending = (game.queue as unknown as { pending: { roomType: string }[] }).pending;
      expect(pending.every((a) => a.roomType !== 'vip'), `seed ${seed}`).toBe(true);
    }
  });
  it('chơi được trọn một ngày ở từng khách sạn (không lỗi, hết ngày thì dừng)', () => {
    const scenarios = validateScenarios(scenarioData);
    for (const h of HOTELS) {
      const game = new Game(h.config, 42, scenarios);
      let guard = 0;
      while (!game.isOver && guard++ < 10_000) {
        if (game.sleepPrompt) game.stayAwake(); // tick dừng chờ người chơi trả lời
        if (game.knock) game.answerKnock(false);
        game.tick(5);
      }
      expect(game.isOver, h.id).toBe(true);
      expect(game.result.stars).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('parseHotels', () => {
  it('chấp nhận dữ liệu đúng, điền giá trị mặc định', () => {
    const [h] = parseHotels([good]);
    expect(h!.config.rooms).toHaveLength(3);
    expect(h!.config.taskMinutes).toEqual({ cleaning: 30, repair: 90, service: 10, fix: 25 });
    expect(h!.config.params.walkInRate).toBe(0);
  });
  it('báo lỗi kèm id khách sạn', () => {
    expect(() => parseHotels(bad({ name: '' }))).toThrow(/\(a\).*name/s);
    expect(() => parseHotels(bad({ goal: { days: 0, minStars: 3 } }))).toThrow(/goal\.days/);
    expect(() => parseHotels(bad({ goal: { days: 1, minStars: 6 } }))).toThrow(/minStars/);
    expect(() => parseHotels(bad({ roomGroups: [] }))).toThrow(/roomGroups/);
    expect(() => parseHotels(bad({ staff: { housekeeping: -1, maintenance: 1 } }))).toThrow(/staff/);
    expect(() => parseHotels(bad({ difficulty: { guestsPerDay: [5, 2], patienceMinutes: 20 } }))).toThrow(/guestsPerDay/);
    expect(() => parseHotels(bad({ difficulty: { guestsPerDay: [1, 2], patienceMinutes: 20, incidentRate: 2 } }))).toThrow(/incidentRate/);
    expect(() => parseHotels({})).toThrow(/mảng/);
  });
  it('bắt nhóm phòng sai', () => {
    const group = (p: object) => bad({ roomGroups: [{ ...good.roomGroups[0], ...p }] });
    expect(() => parseHotels(group({ type: 'suite' }))).toThrow(/type/);
    expect(() => parseHotels(group({ count: 0 }))).toThrow(/count/);
    expect(() => parseHotels(group({ price: 0 }))).toThrow(/price/);
    expect(() => parseHotels(group({ occupied: 2, dirty: 2 }))).toThrow(/vượt quá count/);
  });
  it('bắt chuỗi mở khóa sai: trùng id, trỏ tới khách sạn không có, tự yêu cầu, vòng lặp, không có khách sạn mở sẵn', () => {
    const h = (id: string, requires: string | null) => ({ ...good, id, name: id, unlock: { requires } });
    expect(() => parseHotels([h('a', null), h('a', null)])).toThrow(/trùng id/);
    expect(() => parseHotels([h('a', null), h('b', 'zzz')])).toThrow(/không tồn tại/);
    expect(() => parseHotels([h('a', null), h('b', 'b')])).toThrow(/chính nó/);
    expect(() => parseHotels([h('a', 'b'), h('b', 'a')])).toThrow(/mở sẵn/);
    expect(() => parseHotels([h('a', null), h('b', 'c'), h('c', 'b')])).toThrow(/vòng lặp/);
  });
});
