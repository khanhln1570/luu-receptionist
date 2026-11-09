import { describe, expect, it } from 'vitest';
import { Game, type HotelConfig } from '../src/core/game';
import { SHOO_REPLIES, SMALL_TALK, shooReply, shuffleBag } from '../src/core/smalltalk';
import { SCORE } from '../src/core/scoring';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

const full: HotelConfig = {
  ...SAMPLE_HOTEL,
  params: { ...SAMPLE_HOTEL.params, guestsPerDay: [8, 8], patienceMinutes: 600 },
};

describe('hỏi thăm khách trong sảnh', () => {
  it('hỏi thăm: mỗi vòng ra đủ mọi câu, không lặp liền nhau', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const next = shuffleBag(SMALL_TALK, rand);
    const lines = Array.from({ length: SMALL_TALK.length * 20 }, next);
    // mỗi vòng 6 câu ra đủ 6 câu khác nhau, và không bao giờ lặp hai lần liền
    for (let k = 0; k < lines.length; k += SMALL_TALK.length) expect(new Set(lines.slice(k, k + SMALL_TALK.length)).size).toBe(SMALL_TALK.length);
    lines.slice(1).forEach((l, k) => expect(l).not.toBe(lines[k]));
  });

  it('câu khi bị đuổi: ra đủ mọi câu và không vượt khỏi danh sách', () => {
    const seen = new Set(Array.from({ length: SHOO_REPLIES.length }, (_, i) => shooReply(() => i / SHOO_REPLIES.length)));
    expect(seen.size).toBe(SHOO_REPLIES.length);
    expect(shooReply(() => 0.999999)).toBe(SHOO_REPLIES[SHOO_REPLIES.length - 1]);
  });
});

describe('Game.shooWaiting', () => {
  it('đuổi khách nhận phòng/vãng lai đang chờ: rời hàng, tính như từ chối', () => {
    const game = new Game(full, 5);
    let target;
    while (!game.isOver && !(target = game.queue.waiting.find((w) => w.arrival.kind === 'checkin' || w.arrival.kind === 'walkin'))) game.tick(1);
    expect(target).toBeDefined();
    expect(game.shooWaiting(target!.arrival.id)).toEqual({ ok: true });
    expect(game.queue.waiting.includes(target!)).toBe(false);
    expect(game.stats.turnedAway).toBe(1);
    expect(game.guestScores).toContain(SCORE.turnedAway);
  });

  it('không đuổi được khách cần xử lý (trả phòng) hoặc khách không có trong hàng', () => {
    const game = new Game(full, 5);
    let target;
    while (!game.isOver && !(target = game.queue.waiting.find((w) => w.arrival.kind === 'checkout'))) {
      game.tick(1);
      if (game.queue.waiting.length > 0 && !game.queue.waiting.some((w) => w.arrival.kind === 'checkout')) game.queue.waiting.splice(0);
    }
    expect(target).toBeDefined();
    expect(game.shooWaiting(target!.arrival.id).ok).toBe(false);
    expect(game.shooWaiting('khong-co').ok).toBe(false);
    expect(game.stats.turnedAway).toBe(0);
  });
});
