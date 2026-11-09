import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { buyUpgrade, dayConfigFor, emptySave, parseSave, reputationOf, settleDay, upgradesOf } from '../src/core/progress';
import { emptyRegular, pickRegularVisits, recordRegularVisit } from '../src/core/regulars';
import { REPUTATION, applyReputation, clampReputation, reputationChange } from '../src/core/reputation';
import { Rng } from '../src/core/rng';
import { validateScenarios } from '../src/core/scenarios';
import { SMALL_TALK, UPGRADE_COMPLAINTS, talkPool } from '../src/core/smalltalk';
import { storyFor } from '../src/core/story';
import { UPGRADES, applyUpgrades } from '../src/core/upgrades';
import { CLUES, VISITOR, generateVisitors, visitorReply } from '../src/core/visitors';
import { HOTELS } from '../src/data/hotels';
import { OWNER_VISITS, pickOwnerVisit } from '../src/data/ownerVisits';
import { SERVICE_PRICE } from '../src/core/pricing';
import { REGULARS } from '../src/data/regulars';
import { STORIES } from '../src/data/story';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

const stepTo = (g: Game, id: string, wantActive: boolean) => {
  for (let i = 0; i < 2000 && g.activeVisitors().some((v) => v.id === id) !== wantActive; i++) g.tick(1);
};
const gameWith = (role: 'critic' | 'spy' | 'freeloader') => {
  for (let seed = 1; seed < 500; seed++) {
    const g = new Game(SAMPLE_HOTEL, seed);
    const v = g.visitors.find((x) => x.role === role);
    if (v) {
      stepTo(g, v.id, true);
      return { g, v };
    }
  }
  throw new Error('không tìm được seed có vai này');
};

describe('người lạ có vai ẩn', () => {
  it('mỗi ngày có 1–2 người, cùng seed cho cùng kết quả', () => {
    const a = generateVisitors(new Rng(5), 480, 1320);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a).toEqual(generateVisitors(new Rng(5), 480, 1320));
  });

  it('manh mối của một vai không trùng câu nói chung hay vai khác', () => {
    const all = Object.values(CLUES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const line of all) expect(SMALL_TALK as readonly string[]).not.toContain(line);
  });

  it('hỏi thăm: ra manh mối của vai khi rút trúng, còn lại là câu chung', () => {
    const v = { id: 'v1', name: 'A', role: 'spy', arrivalMinute: 0, stayMinutes: 1 } as const;
    expect(CLUES.spy).toContain(visitorReply(v, () => 0));
    expect(SMALL_TALK as readonly string[]).toContain(visitorReply(v, () => VISITOR.clueChance + 0.01));
  });

  it('người lạ chỉ ở sảnh trong thời gian ở lại rồi tự đi', () => {
    const { g, v } = gameWith('freeloader');
    expect(g.activeVisitors().map((x) => x.id)).toContain(v.id);
    stepTo(g, v.id, false);
    expect(g.activeVisitors().map((x) => x.id)).not.toContain(v.id);
  });

  it('mời nước nhà phê bình: điểm cao, thêm tiền, danh tiếng tăng', () => {
    const { g, v } = gameWith('critic');
    const out = g.treatVisitor(v.id);
    expect(out).toMatchObject({ ok: true, good: true });
    expect(g.guestScores).toContain(VISITOR.criticPraised);
    expect(g.stats.revenue).toBe(VISITOR.criticTip - VISITOR.drinkCost);
    expect(g.reputationBonus).toBeGreaterThan(0);
    expect(g.activeVisitors().map((x) => x.id)).not.toContain(v.id);
  });

  it('đuổi nhầm nhà phê bình: bị chấm thấp và mất danh tiếng', () => {
    const { g, v } = gameWith('critic');
    expect(g.shooVisitor(v.id)).toMatchObject({ ok: true, good: false });
    expect(g.guestScores).toContain(VISITOR.criticShooed);
    expect(g.reputationBonus).toBeLessThan(0);
    expect(g.events.at(-1)?.kind).toBe('bad');
  });

  it('đuổi đúng gián điệp thì tốt, mời nước gián điệp thì xấu', () => {
    const a = gameWith('spy');
    expect(a.g.shooVisitor(a.v.id)).toMatchObject({ ok: true, good: true });
    expect(a.g.guestScores).toContain(VISITOR.spyShooed);
    const b = gameWith('spy');
    expect(b.g.treatVisitor(b.v.id)).toMatchObject({ ok: true, good: false });
    expect(b.g.stats.revenue).toBe(-VISITOR.drinkCost);
  });

  it('xử lý một người hai lần thì lần sau báo lỗi; mời nước khách thường chỉ tốn tiền', () => {
    const { g, v } = gameWith('freeloader');
    expect(g.shooVisitor(v.id).ok).toBe(true);
    expect(g.shooVisitor(v.id).ok).toBe(false);
    expect(g.treatVisitor(v.id).ok).toBe(false);
    expect(g.askVisitor(v.id)).toBeNull();
    const before = g.stats.revenue;
    g.treatGuest();
    expect(g.stats.revenue).toBe(before - VISITOR.drinkCost);
  });

  it('người lạ không đổi lịch khách thường của cùng seed', () => {
    const a = new Game(SAMPLE_HOTEL, 11);
    const b = new Game(SAMPLE_HOTEL, 11);
    expect(a.queue.pendingCount).toBe(b.queue.pendingCount);
    expect(a.revenueTarget).toBe(b.revenueTarget);
  });
});

describe('danh tiếng', () => {
  it('ở mức trung bình thì giữ nguyên, cao thì đông và kiên nhẫn hơn, thấp thì ngược lại', () => {
    const p = { ...SAMPLE_HOTEL.params, guestsPerDay: [8, 10] as const, patienceMinutes: 25 };
    expect(applyReputation(p, REPUTATION.start)).toEqual(p);
    const hi = applyReputation(p, 100);
    const lo = applyReputation(p, 0);
    expect(hi.guestsPerDay[1]).toBeGreaterThan(p.guestsPerDay[1]);
    expect(hi.patienceMinutes).toBeGreaterThan(p.patienceMinutes);
    expect(lo.guestsPerDay[1]).toBeLessThan(p.guestsPerDay[1]);
    expect(lo.patienceMinutes).toBeLessThan(p.patienceMinutes);
    expect(lo.guestsPerDay[0]).toBeGreaterThanOrEqual(1);
  });

  it('đổi theo sao cộng biến cố và luôn nằm trong 0..100', () => {
    expect(reputationChange(5, 0)).toBeGreaterThan(0);
    expect(reputationChange(1, 0)).toBeLessThan(0);
    expect(reputationChange(3, 4)).toBe(4);
    expect(clampReputation(150)).toBe(100);
    expect(clampReputation(-5)).toBe(0);
  });
});

describe('nâng cấp', () => {
  it('áp vào cấu hình: nhân viên, kiên nhẫn, sự cố, phòng hỏng; không sửa cấu hình gốc', () => {
    const all = UPGRADES.map((u) => u.id);
    const cfg = applyUpgrades(SAMPLE_HOTEL, all);
    expect(cfg.staff.housekeeping).toBe(SAMPLE_HOTEL.staff.housekeeping + 1);
    expect(cfg.staff.maintenance).toBe(SAMPLE_HOTEL.staff.maintenance + 1);
    expect(cfg.params.patienceMinutes).toBeGreaterThan(SAMPLE_HOTEL.params.patienceMinutes);
    expect(cfg.params.incidentRate!).toBeLessThan(SAMPLE_HOTEL.params.incidentRate!);
    expect(cfg.rooms.some((r) => r.status === 'broken')).toBe(false);
    expect(SAMPLE_HOTEL.rooms.some((r) => r.status === 'broken')).toBe(true);
    expect(applyUpgrades(SAMPLE_HOTEL, [])).toEqual(SAMPLE_HOTEL);
  });

  it('mua: trừ tiền, mỗi món một lần, thiếu tiền thì từ chối', () => {
    const s0 = { ...emptySave(), money: 700_000 };
    expect(buyUpgrade(s0, 'a', 'wifi').ok).toBe(false); // 800k
    const r = buyUpgrade(s0, 'a', 'sofa');
    expect(r.ok && r.save?.money).toBe(100_000);
    expect(upgradesOf(r.save!, 'a')).toEqual(['sofa']);
    expect(upgradesOf(r.save!, 'b')).toEqual([]); // theo từng khách sạn
    expect(buyUpgrade({ ...r.save!, money: 9e6 }, 'a', 'sofa').ok).toBe(false);
    expect(buyUpgrade(s0, 'a', 'khong-co').ok).toBe(false);
  });

  it('đã mua wifi thì hết câu than wifi, có câu khen', () => {
    const complaint = UPGRADE_COMPLAINTS.wifi![0]!;
    expect(talkPool([])).toContain(complaint);
    expect(talkPool(['wifi'])).not.toContain(complaint);
    expect(talkPool(['wifi']).length).toBe(talkPool([]).length);
    for (const lines of Object.values(UPGRADE_COMPLAINTS)) for (const l of lines) expect(SMALL_TALK as readonly string[]).toContain(l);
  });
});

describe('khách quen', () => {
  it('kịch bản của khách quen hợp lệ và mỗi khách sạn có người', () => {
    expect(() => validateScenarios(REGULARS.flatMap((r) => r.visits))).not.toThrow();
    for (const h of HOTELS) expect(REGULARS.some((r) => r.hotelId === h.id)).toBe(true);
    for (const r of REGULARS) expect(r.visits.length).toBe(3);
  });

  it('ghé lần lượt theo thứ tự, hết lượt hoặc đã bỏ đi thì không ghé nữa', () => {
    const regs = REGULARS.filter((r) => r.hotelId === 'nha-nghi-hoa-mai');
    const always = { next: () => 0, chance: () => true } as unknown as Rng;
    const first = pickRegularVisits(regs, 'nha-nghi-hoa-mai', {}, always);
    expect(first.map((v) => v.scenario.id)).toEqual(regs.map((r) => r.visits[0]!.id));
    const second = pickRegularVisits(regs, 'nha-nghi-hoa-mai', { 'chu-tam': { visits: 1, mood: 6, gone: false } }, always);
    expect(second.find((v) => v.regular.id === 'chu-tam')!.scenario.id).toBe('rg-chu-tam-2');
    const done = pickRegularVisits(regs, 'nha-nghi-hoa-mai', { 'chu-tam': { visits: 3, mood: 20, gone: false }, 'co-hanh': { visits: 1, mood: -20, gone: true } }, always);
    expect(done).toEqual([]);
    expect(pickRegularVisits(regs, 'khach-san-hoa-mai', {}, always)).toEqual([]);
  });

  it('đối xử tệ thì bỏ đi, đối xử tốt thì tích lũy tâm trạng', () => {
    let st = emptyRegular();
    st = recordRegularVisit(st, -6);
    expect(st.gone).toBe(false);
    st = recordRegularVisit(st, -6);
    expect(st).toMatchObject({ visits: 2, mood: -12, gone: true });
  });

  it('khách quen ghé hôm nay xuất hiện như tình huống đặc biệt, ghi kết quả và thành bạn ở lần cuối', () => {
    const reg = REGULARS.find((r) => r.id === 'chu-tam')!;
    const visit = { regular: reg, scenario: reg.visits[2]!, finale: true, mood: 5 };
    const patient = { ...SAMPLE_HOTEL, params: { ...SAMPLE_HOTEL.params, patienceMinutes: 5000 } };
    const g = new Game(patient, 3, [], { regularVisits: [visit] });
    while (g.queue.pendingCount > 0) g.tick(1);
    let found = false;
    for (let guest = g.callNext(); guest && !found; guest = g.callNext()) {
      if (guest.arrival.regularId === 'chu-tam') found = true;
      else g.queue.finishCurrent();
    }
    expect(found).toBe(true);
    const before = g.stats.revenue;
    const res = g.chooseOption(0); // 'Tặng chú một bữa sáng chia tay' +10
    expect(res.ok).toBe(true);
    expect(g.regularOutcomes).toEqual([{ id: 'chu-tam', satisfaction: 10, finale: true, becameFriend: true }]);
    expect(g.stats.revenue).toBeGreaterThan(before);
    expect(g.events.at(-1)?.text).toContain('thành bạn');
  });
});

describe('cốt truyện', () => {
  const story = STORIES['nha-nghi-hoa-mai']!;

  it('mỗi khách sạn có truyện, chương mở dần theo số ngày đạt và đủ chương tới lúc hoàn thành', () => {
    for (const h of HOTELS) {
      const s = STORIES[h.id]!;
      expect(s).toBeDefined();
      expect(s.chapters.at(-1)!.when).toBe(h.goal.days);
      expect(s.chapters.map((c) => c.when)).toEqual([...s.chapters.map((c) => c.when)].sort((a, b) => a - b));
    }
  });

  it('kể chương kế tiếp khi đủ ngày đạt, mỗi ngày một chương, không bỏ sót', () => {
    const d1 = storyFor(story, 0, { days: 1, goodDays: 1 }, 4); // ngày đầu đã đạt luôn: chương 1
    expect(d1.beat?.chapter).toBe(story.chapters[0]!.title);
    const d2 = storyFor(story, d1.seen, { days: 2, goodDays: 2 }, 4); // vẫn còn chương 2 chưa kể
    expect(d2.beat?.chapter).toBe(story.chapters[1]!.title);
    const d3 = storyFor(story, d2.seen, { days: 3, goodDays: 2 }, 4);
    expect(d3.beat?.chapter).toBe(story.chapters[2]!.title);
  });

  it('chưa đủ ngày đạt thì chỉ có nhận xét theo sao', () => {
    const r = storyFor(story, 1, { days: 2, goodDays: 0 }, 1);
    expect(r.seen).toBe(1);
    expect(r.beat?.chapter).toBeUndefined();
    expect(story.daily.low).toContain(r.beat!.lines[0]);
    expect(storyFor(undefined, 0, { days: 1, goodDays: 1 }, 3).beat).toBeNull();
  });
});

describe('tiến trình mở rộng', () => {
  const hotel = HOTELS[0]!;

  it('kết ngày: cộng tiền, đổi danh tiếng, ghi khách quen và chương truyện', () => {
    const s = settleDay(emptySave(), hotel.id, {
      revenue: 900_000,
      stars: 4,
      reputationBonus: 2,
      regulars: [{ id: 'chu-tam', satisfaction: 6, finale: false, becameFriend: false }],
      seenChapters: 1,
    });
    expect(s.money).toBe(900_000);
    expect(reputationOf(s, hotel.id)).toBe(REPUTATION.start + reputationChange(4, 2));
    expect(s.regulars['chu-tam']).toEqual({ visits: 1, mood: 6, gone: false });
    expect(s.chapters[hotel.id]).toBe(1);
  });

  it('doanh thu âm không làm mất tiền tích lũy', () => {
    const s = settleDay({ ...emptySave(), money: 500 }, hotel.id, { revenue: -300_000, stars: 3, reputationBonus: 0, regulars: [], seenChapters: 0 });
    expect(s.money).toBe(500);
  });

  it('cấu hình ngày dùng danh tiếng và nâng cấp đã lưu', () => {
    let s = emptySave();
    s = { ...s, reputation: { [hotel.id]: 100 }, upgrades: { [hotel.id]: ['housekeeper'] } };
    const cfg = dayConfigFor(hotel, s);
    expect(cfg.staff.housekeeping).toBe(hotel.config.staff.housekeeping + 1);
    expect(cfg.params.guestsPerDay[1]).toBeGreaterThanOrEqual(hotel.config.params.guestsPerDay[1]);
  });

  it('đọc bản lưu cũ thiếu trường mới và bỏ qua phần hỏng', () => {
    const old = JSON.stringify({ version: 1, hotels: { a: { days: 1, goodDays: 1, bestStars: 3, bestScore: 60 } } });
    expect(parseSave(old)).toEqual({ ...emptySave(), hotels: { a: { days: 1, goodDays: 1, bestStars: 3, bestScore: 60 } } });
    const messy = JSON.stringify({
      version: 1,
      hotels: {},
      money: -5,
      reputation: { a: 70, b: 'x' },
      upgrades: { a: ['wifi', 'khong-co', 3], b: 'x' },
      regulars: { r: { visits: 2, mood: -1 }, s: { visits: 'x' } },
      chapters: { a: 2, b: -1 },
    });
    expect(parseSave(messy)).toMatchObject({
      money: 0,
      reputation: { a: 70 },
      upgrades: { a: ['wifi'] },
      regulars: { r: { visits: 2, mood: -1, gone: false } },
      chapters: { a: 2 },
    });
  });

});

describe('lễ tân tự động', () => {
  it('tự chơi hết một ngày: phục vụ mọi khách, không kẹt, có doanh thu', async () => {
    const { autoStep } = await import('../src/core/autopilot');
    const scenarios = validateScenarios((await import('../src/data/scenarios.json')).default);
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = new Game({ ...SAMPLE_HOTEL, params: { ...SAMPLE_HOTEL.params, patienceMinutes: 120 } }, seed, scenarios);
      for (let i = 0; i < 5000 && !g.isOver; i++) {
        g.tick(1);
        autoStep(g);
      }
      expect(g.isOver).toBe(true);
      expect(g.queue.current).toBeNull();
      expect(g.unserved).toBeLessThanOrEqual(1);
      expect(g.stats.checkedIn + g.stats.checkedOut + g.stats.scenarios).toBeGreaterThan(0);
    }
  });
});

describe('chọn tình huống để thử', () => {
  const scenarios = validateScenarios(JSON.parse(readFileSync('src/data/scenarios.json', 'utf-8')));
  const fresh = (seed = 1) => new Game({ ...SAMPLE_HOTEL, params: { ...SAMPLE_HOTEL.params, patienceMinutes: 600 } }, seed, scenarios);

  it('mọi tình huống đều xảy ra được ngay ở quầy với đúng kịch bản', () => {
    for (const sc of scenarios) {
      const g = fresh();
      expect(g.triggerScenario(sc.id), sc.id).toEqual({ ok: true });
      expect(g.queue.current?.arrival.scenarioId).toBe(sc.id);
      const view = g.currentScenario();
      expect(view?.options.length).toBe(sc.options.length);
      expect(view!.lines.join(' ')).not.toMatch(/\{\w+\}/); // biến đã được thay
    }
  });

  it('chọn xong thì xử lý được như khách bình thường', () => {
    const g = fresh();
    const sc = scenarios.find((s) => s.type === 'overbooking')!;
    g.triggerScenario(sc.id);
    const idx = sc.options.findIndex((o) => o.effects.cancel);
    expect(g.chooseOption(idx).ok).toBe(true);
    expect(g.queue.current).toBeNull();
  });

  it('báo lỗi khi tình huống không có, hết ngày, hoặc không có khách để báo sự cố', () => {
    const g = fresh();
    expect(g.triggerScenario('khong-co').ok).toBe(false);
    const empty = new Game({ ...SAMPLE_HOTEL, rooms: SAMPLE_HOTEL.rooms.map((r) => ({ ...r, status: 'vacant_clean' as const })) }, 1, scenarios);
    expect(empty.triggerScenario(scenarios.find((s) => s.type === 'incident')!.id).ok).toBe(false);
    while (!g.isOver) g.tick(60);
    expect(g.triggerScenario(scenarios[0]!.id).ok).toBe(false);
  });

  it('khách đang chờ ở quầy thì tình huống mới xếp vào hàng chờ', () => {
    const g = fresh();
    const [a, b] = scenarios.filter((s) => s.type === 'special');
    g.triggerScenario(a!.id);
    g.triggerScenario(b!.id);
    expect(g.queue.current?.arrival.scenarioId).toBe(a!.id);
    expect(g.queue.waiting.map((w) => w.arrival.scenarioId)).toEqual([b!.id]);
  });
});

describe('chủ khách sạn ghé quầy', () => {
  const all = Object.values(OWNER_VISITS).flat();
  const patient = { ...SAMPLE_HOTEL, params: { ...SAMPLE_HOTEL.params, patienceMinutes: 5000 } };

  it('mỗi khách sạn có 3 tình huống, hợp lệ, mang tên đúng chủ của khách sạn', () => {
    expect(() => validateScenarios(all)).not.toThrow();
    for (const h of HOTELS) {
      const list = OWNER_VISITS[h.id]!;
      expect(list.length).toBe(3);
      for (const sc of list) expect(sc.guest).toBe(STORIES[h.id]!.owner.name);
    }
  });

  it('chọn ngẫu nhiên theo seed: có ngày ghé, có ngày không, không ghé ở nơi không có chủ', () => {
    const results = Array.from({ length: 60 }, (_, i) => pickOwnerVisit('nha-nghi-hoa-mai', new Rng(i)));
    expect(results.some((r) => r)).toBe(true);
    expect(results.some((r) => !r)).toBe(true);
    expect(pickOwnerVisit('khong-co', new Rng(1))).toBeUndefined();
  });

  it('chủ ghé hôm nay thì xuất hiện ở quầy với đúng tên; làm tốt thì tăng danh tiếng, làm tệ thì giảm', () => {
    const sc = OWNER_VISITS['khach-san-hoa-mai']![0]!;
    const run = (opt: number) => {
      const g = new Game(patient, 4, [], { ownerVisit: sc });
      while (g.queue.pendingCount > 0) g.tick(1);
      for (let cur = g.callNext(); cur; cur = g.callNext()) {
        if (cur.arrival.id === 'owner') {
          expect(cur.arrival.guestName).toBe('Ông Thịnh');
          g.chooseOption(opt);
          return g.reputationBonus;
        }
        g.queue.finishCurrent();
      }
      throw new Error('chủ không xuất hiện');
    };
    expect(run(0)).toBeGreaterThan(0);
    expect(run(2)).toBeLessThan(0);
  });

  it('thử được bằng triggerScenario khi truyền vào extraScenarios', () => {
    const g = new Game(patient, 1, [], { extraScenarios: all });
    expect(g.triggerScenario('chu-ania-doan-som')).toEqual({ ok: true });
    expect(g.queue.current?.arrival.guestName).toBe('Chị Ania');
    expect(g.currentScenario()?.options.length).toBe(3);
  });
});

describe('phí dịch vụ dọn phòng và sửa chữa', () => {
  const fresh = () => new Game(SAMPLE_HOTEL, 1);

  it('chuông liệt kê phòng chưa dọn và hỏng kèm giá theo loại phòng', () => {
    const needs = fresh().needsService();
    expect(needs.map((n) => [n.roomId, n.kind, n.price])).toEqual([
      ['101', 'cleaning', SERVICE_PRICE.cleaning.don],
      ['202', 'repair', SERVICE_PRICE.repair.don],
    ]);
    expect(SERVICE_PRICE.repair.vip).toBeGreaterThan(SERVICE_PRICE.repair.don);
  });

  it('báo giá có thời gian dự kiến; phòng không cần dịch vụ thì không có báo giá', () => {
    const g = fresh();
    expect(g.quoteService('101')).toMatchObject({ kind: 'cleaning', price: 30_000, minutes: SAMPLE_HOTEL.taskMinutes.cleaning });
    expect(g.quoteService('102')).toBeNull();
    expect(g.quoteService('khong-co')).toBeNull();
  });

  it('giao việc thì trừ vào doanh thu và ghi vào chi phí; giao lại thì không trừ thêm', () => {
    const g = fresh();
    expect(g.assignTask('101', 'cleaning').ok).toBe(true);
    expect(g.stats.revenue).toBe(-30_000);
    expect(g.stats.serviceCost).toBe(30_000);
    expect(g.assignTask('101', 'cleaning').ok).toBe(false);
    expect(g.stats.revenue).toBe(-30_000);
    expect(g.assignTask('202', 'repair').ok).toBe(true);
    expect(g.stats.revenue).toBe(-30_000 - 150_000);
  });

  it('phòng đã giao việc thì biến khỏi chuông; làm xong thì không còn phòng cần dọn', () => {
    const g = fresh();
    g.assignTask('101', 'cleaning');
    expect(g.needsService().map((n) => n.roomId)).toEqual(['202']);
    g.assignTask('202', 'repair');
    for (let i = 0; i < 200; i++) g.tick(1);
    expect(g.rooms.find((r) => r.id === '101')!.status).toBe('vacant_clean');
    expect(g.needsService().filter((n) => ['101', '202'].includes(n.roomId))).toEqual([]);
  });

  it('việc từ tình huống (khăn, sửa nhỏ) không tính phí dịch vụ', () => {
    const g = fresh();
    expect(g.assignTask('103', 'service').ok).toBe(true);
    expect(g.stats.revenue).toBe(0);
    expect(g.stats.serviceCost).toBe(0);
  });
});
