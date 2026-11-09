import { describe, expect, it } from 'vitest';
import { SCORE, computeDayResult, meanScore, starsFor, waitPenalty } from '../src/core/scoring';

describe('waitPenalty', () => {
  it('không trừ khi chưa chờ, trừ tối đa khi cạn kiên nhẫn, tỉ lệ ở giữa', () => {
    expect(waitPenalty(20, 20)).toBe(0);
    expect(waitPenalty(10, 20)).toBe(SCORE.maxWaitPenalty / 2);
    expect(waitPenalty(0, 20)).toBe(SCORE.maxWaitPenalty);
    expect(waitPenalty(-5, 20)).toBe(SCORE.maxWaitPenalty);
    expect(waitPenalty(5, 0)).toBe(0);
  });
});

describe('meanScore', () => {
  it('trung bình các điểm; chưa có khách thì dùng điểm mặc định', () => {
    expect(meanScore([])).toBe(SCORE.defaultSatisfaction);
    expect(meanScore([100, 50, 0])).toBe(50);
  });
});

describe('starsFor', () => {
  it('đúng ngưỡng 90 / 75 / 60 / 40', () => {
    const cases: [number, number][] = [[100, 5], [90, 5], [89, 4], [75, 4], [74, 3], [60, 3], [59, 2], [40, 2], [39, 1], [0, 1]];
    for (const [score, stars] of cases) expect(starsFor(score), `điểm ${score}`).toBe(stars);
  });
});

describe('computeDayResult', () => {
  const base = { unservedGuests: 0, revenueTarget: 1000 };

  it('ngày hoàn hảo: hài lòng 100 và đạt mục tiêu doanh thu thì 5 sao, 100 điểm', () => {
    expect(computeDayResult({ ...base, scores: [100, 100], revenue: 1000 })).toMatchObject({ score: 100, stars: 5, satisfaction: 100, revenueScore: 100 });
  });
  it('điểm tổng = 60% hài lòng + 40% doanh thu', () => {
    const r = computeDayResult({ ...base, scores: [100], revenue: 500 });
    expect(r.revenueScore).toBe(50);
    expect(r.score).toBe(80); // 0,6 × 100 + 0,4 × 50
    expect(r.stars).toBe(4);
  });
  it('doanh thu vượt mục tiêu bị chặn ở 100; doanh thu âm tính là 0', () => {
    expect(computeDayResult({ ...base, scores: [100], revenue: 5000 }).revenueScore).toBe(100);
    expect(computeDayResult({ ...base, scores: [100], revenue: -300 }).revenueScore).toBe(0);
  });
  it('khách đã đến nhưng chưa được phục vụ kéo hài lòng xuống', () => {
    const r = computeDayResult({ ...base, scores: [100], unservedGuests: 1, revenue: 1000 });
    expect(r.satisfaction).toBe(Math.round((100 + SCORE.unserved) / 2));
  });
  it('không có mục tiêu doanh thu thì chỉ tính theo hài lòng', () => {
    expect(computeDayResult({ scores: [80], unservedGuests: 0, revenue: 0, revenueTarget: 0 }).revenueScore).toBe(100);
  });
});
