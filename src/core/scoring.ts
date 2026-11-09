/** Chấm điểm: mỗi khách một điểm 0..100, hài lòng cả ngày là trung bình; sao dựa trên hài lòng và doanh thu. */
export const SCORE = {
  served: 85, // khách được phục vụ đúng, không chờ
  scenarioBase: 60, // khách tình huống: điểm gốc, cộng/trừ theo lựa chọn
  scenarioPerPoint: 2.5, // mỗi điểm hiệu ứng của lựa chọn đổi được bấy nhiêu điểm
  left: 10, // khách chờ quá lâu bỏ đi
  turnedAway: 30, // khách bị từ chối
  unserved: 20, // khách đã đến nhưng hết ngày chưa được phục vụ
  waivedBonus: 5, // miễn phụ phí cho khách trả phòng
  mistakePenalty: 8, // mỗi lần chọn sai với khách đang ở quầy
  maxWaitPenalty: 25, // trừ tối đa khi chờ cạn kiên nhẫn rồi mới được phục vụ
  defaultSatisfaction: 70, // chưa phục vụ khách nào
} as const;

/** Trọng số trong điểm cuối ngày. */
export const WEIGHTS = { satisfaction: 0.6, revenue: 0.4 } as const;

export type Stars = 1 | 2 | 3 | 4 | 5;

export const clampScore = (n: number): number => Math.max(0, Math.min(100, n));

/** Điểm trừ vì chờ lâu: tỉ lệ với phần kiên nhẫn đã dùng. */
export function waitPenalty(patienceLeft: number, patienceTotal: number): number {
  if (patienceTotal <= 0) return 0;
  const used = 1 - Math.max(0, Math.min(1, patienceLeft / patienceTotal));
  return SCORE.maxWaitPenalty * used;
}

export function meanScore(scores: readonly number[]): number {
  if (scores.length === 0) return SCORE.defaultSatisfaction;
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}

export function starsFor(score: number): Stars {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

export interface DayInput {
  scores: readonly number[];
  unservedGuests: number;
  revenue: number;
  revenueTarget: number;
}

export interface DayResult {
  stars: Stars;
  score: number; // điểm tổng 0..100
  satisfaction: number; // hài lòng trung bình, đã tính khách chưa được phục vụ
  revenue: number;
  revenueTarget: number;
  revenueScore: number; // doanh thu so với mục tiêu, tối đa 100
}

export function computeDayResult(i: DayInput): DayResult {
  const all = [...i.scores, ...Array<number>(i.unservedGuests).fill(SCORE.unserved)];
  const satisfaction = Math.round(meanScore(all));
  const revenueScore = i.revenueTarget > 0 ? Math.round(clampScore((i.revenue / i.revenueTarget) * 100)) : 100;
  const score = Math.round(WEIGHTS.satisfaction * satisfaction + WEIGHTS.revenue * revenueScore);
  return { stars: starsFor(score), score, satisfaction, revenue: i.revenue, revenueTarget: i.revenueTarget, revenueScore };
}
