import { randomName } from './guests';
import type { Rng } from './rng';
import { SMALL_TALK } from './smalltalk';

/** Người lạ trong sảnh có vai ẩn: nhà phê bình (cần phục vụ chu đáo), gián điệp đối thủ, hay người ăn chực máy lạnh. */
export type VisitorRole = 'critic' | 'spy' | 'freeloader';

export interface Visitor {
  id: string;
  name: string;
  role: VisitorRole;
  arrivalMinute: number;
  stayMinutes: number; // ở lại sảnh bao lâu rồi tự đi nếu không ai xử lý
}

export const VISITOR = {
  drinkCost: 20_000, // mời nước: tốn tiền với bất kỳ ai
  criticTip: 150_000, // bài review tốt kéo thêm khách
  criticPraised: 100, // điểm hài lòng khi nhà phê bình được phục vụ chu đáo
  criticShooed: 5, // điểm khi lỡ đuổi nhà phê bình
  spyShooed: 90, // điểm khi đuổi đúng gián điệp
  clueChance: 0.7, // xác suất một lần hỏi thăm ra manh mối thật (còn lại là câu nói đùa gây nhiễu)
} as const;

/** Manh mối của từng vai: chỉ người có vai đó mới nói những câu này. */
export const CLUES: Record<VisitorRole, readonly string[]> = {
  critic: [
    'Tôi đang chấm điểm khách sạn. Hiện tại: 2 sao, sofa gánh.',
    'Tôi coi review trên mạng, tới kiểm chứng xem có tệ thật không.',
    'Cho hỏi quy trình xử lý khiếu nại ở đây thế nào? À, hỏi cho vui thôi.',
    '(lặng lẽ ghi gì đó vào cuốn sổ tay nhỏ) …',
  ],
  spy: [
    'Tôi là đối thủ, vào coi decor thôi.',
    'Chỗ này đẹp ghê, tiếc là giá phòng không đẹp bằng.',
    'Phòng đơn ở đây giá bao nhiêu nhỉ? Tôi… tò mò chút thôi.',
    'Nhân viên ở đây lương bao nhiêu vậy? Hỏi chơi thôi mà.',
  ],
  freeloader: [
    'Ngồi chơi máy lạnh miễn phí thôi, cấm đuổi nha.',
    'Tôi đang trốn nắng. Và trốn sếp. Đừng nói ai nha.',
    'Có nước lọc miễn phí không? Có bánh quy không?',
    'Tôi đợi bạn từ sáng tới giờ rồi. Chắc nó quên.',
  ],
};

export const ROLE_LABEL: Record<VisitorRole, string> = {
  critic: 'nhà phê bình',
  spy: 'gián điệp của đối thủ',
  freeloader: 'người ăn chực máy lạnh',
};

/** Sinh 1–2 người lạ cho một ngày. Dùng bộ ngẫu nhiên riêng để không đổi lịch khách. */
export function generateVisitors(rng: Rng, openMinute: number, closeMinute: number): Visitor[] {
  const count = rng.int(1, 2);
  const last = Math.max(openMinute + 60, closeMinute - 300);
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i + 1}`,
    name: randomName(rng),
    role: rng.weighted<VisitorRole>([['critic', 2], ['spy', 1], ['freeloader', 2]]),
    arrivalMinute: rng.int(openMinute + 60, last),
    stayMinutes: rng.int(150, 300),
  }));
}

/** Câu trả lời khi hỏi thăm một người lạ: thường là manh mối của vai, đôi khi là câu đùa chung. */
export function visitorReply(v: Visitor, rand: () => number): string {
  const pool = rand() < VISITOR.clueChance ? CLUES[v.role] : SMALL_TALK;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

export type VisitorOutcome = { ok: true; message: string; good: boolean } | { ok: false; error: string };
