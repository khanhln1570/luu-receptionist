import type { DayParams } from './guests';
import type { Stars } from './scoring';

/** Danh tiếng của một khách sạn, 0..100, bắt đầu ở mức trung bình. */
export const REPUTATION = { start: 50, min: 0, max: 100 } as const;

const STAR_DELTA: Record<Stars, number> = { 1: -8, 2: -4, 3: 0, 4: 4, 5: 8 };

export const clampReputation = (n: number): number => Math.max(REPUTATION.min, Math.min(REPUTATION.max, Math.round(n)));

/** Danh tiếng đổi bao nhiêu sau một ngày: theo số sao, cộng thêm biến cố trong ngày (review, khách quen...). */
export const reputationChange = (stars: Stars, bonus: number): number => STAR_DELTA[stars] + bonus;

/**
 * Danh tiếng cao thì đông khách hơn (tối đa +25%) và khách kiên nhẫn hơn (tối đa +20%); thấp thì ngược lại.
 * Ở mức trung bình thì giữ nguyên tham số.
 */
export function applyReputation(params: DayParams, reputation: number): DayParams {
  const r = reputation - REPUTATION.start;
  const guests = 1 + r / 200;
  const patience = 1 + r / 250;
  const [lo, hi] = params.guestsPerDay;
  return {
    ...params,
    guestsPerDay: [Math.max(1, Math.round(lo * guests)), Math.max(1, Math.round(hi * guests))],
    patienceMinutes: Math.max(1, Math.round(params.patienceMinutes * patience)),
  };
}

export function reputationLabel(reputation: number): string {
  if (reputation >= 80) return 'Nức tiếng';
  if (reputation >= 60) return 'Được yêu thích';
  if (reputation >= 40) return 'Bình thường';
  if (reputation >= 20) return 'Tiếng xấu';
  return 'Tai tiếng';
}
