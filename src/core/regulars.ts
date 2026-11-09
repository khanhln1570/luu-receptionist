import type { Personality } from './guests';
import type { Rng } from './rng';
import type { RoomType } from './rooms';
import type { Scenario } from './scenarios';

/** Khách quen: quay lại nhiều ngày với chuyện riêng. Mỗi lần ghé là một tình huống đặc biệt, theo thứ tự. */
export interface Regular {
  id: string;
  name: string;
  hotelId: string;
  personality: Personality;
  roomType: RoomType;
  visits: readonly Scenario[]; // lần ghé thứ i; lần cuối là lần chia tay/kết chuyện
  farewell: string; // lời kể khi họ thành bạn của khách sạn sau lần cuối
}

export interface RegularState {
  visits: number; // đã ghé bao nhiêu lần
  mood: number; // tổng điểm hài lòng qua các lần
  gone: boolean; // bị đối xử tệ quá nên không quay lại
}

export interface RegularVisit {
  regular: Regular;
  scenario: Scenario;
  finale: boolean; // lần ghé cuối
  mood: number; // tâm trạng trước lần ghé này
}

export interface RegularOutcome {
  id: string;
  satisfaction: number; // điểm hiệu ứng của lựa chọn
  finale: boolean;
  becameFriend: boolean;
}

export const REGULAR = {
  chance: 0.8, // xác suất mỗi khách quen còn lượt ghé xuất hiện trong một ngày
  goneMood: -8, // tâm trạng tích lũy tới mức này thì họ không quay lại nữa
  friendMood: 8, // tổng tâm trạng sau lần cuối từ mức này trở lên thì thành bạn
  friendBonus: 200_000,
} as const;

export const emptyRegular = (): RegularState => ({ visits: 0, mood: 0, gone: false });

/** Những khách quen của khách sạn này sẽ ghé hôm nay. */
export function pickRegularVisits(
  regulars: readonly Regular[],
  hotelId: string,
  states: Readonly<Record<string, RegularState>>,
  rng: Rng,
): RegularVisit[] {
  const out: RegularVisit[] = [];
  for (const r of regulars) {
    if (r.hotelId !== hotelId) continue;
    const st = states[r.id] ?? emptyRegular();
    const scenario = r.visits[st.visits];
    if (st.gone || !scenario || !rng.chance(REGULAR.chance)) continue;
    out.push({ regular: r, scenario, finale: st.visits === r.visits.length - 1, mood: st.mood });
  }
  return out;
}

/** Ghi lại một lần ghé; không sửa trạng thái cũ. */
export function recordRegularVisit(state: RegularState, satisfaction: number): RegularState {
  const mood = state.mood + satisfaction;
  return { visits: state.visits + 1, mood, gone: state.gone || mood <= REGULAR.goneMood };
}
