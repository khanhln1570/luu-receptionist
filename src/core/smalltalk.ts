/** Câu trả lời ngẫu nhiên khi lễ tân bấm vào một người trong sảnh và hỏi thăm. */
export const SMALL_TALK = [
  'Tôi tới coi phòng thôi.',
  'Kệ tôi, làm việc của mình đi.',
  '(im lặng) …',
  'Tôi đi cùng với người khác.',
  'Tôi vào nhầm khách sạn.',
  'Tôi là đối thủ, vào coi decor thôi.',
] as const;

/**
 * Rút câu kiểu "túi xáo": mỗi câu ra một lần rồi mới xáo lại cả túi, và câu đầu túi mới
 * không trùng câu vừa nói, nên không có câu nào lặp liên tục. rand trả số trong [0, 1).
 */
export function shuffleBag<T>(items: readonly T[], rand: () => number): () => T {
  let bag: T[] = [];
  let last: T | undefined;
  return () => {
    if (bag.length === 0) {
      bag = [...items];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
    }
    last = bag.pop()!;
    return last;
  };
}

/** Câu khách văng ra khi bị đuổi: châm chọc, mỉa mai cho vui. */
export const SHOO_REPLIES = [
  '#$%^#@!% 😡',
  'Mong khách sạn làm ăn thua lỗ!',
  'Đèo mẹ…',
  'Kệ thôi.',
  'Tôi sẽ cho một sao trên mạng!',
  'Đuổi khéo ghê, học ở trường nào vậy?',
  'Thôi qua khách sạn đối diện, bên đó wifi mạnh hơn.',
  'Lễ tân gì mà dễ thương… dễ thương hại.',
  'Sau này đừng có năn nỉ tôi quay lại nha!',
  'Ủa, tôi còn chưa kịp check-in drama mà.',
  'Được rồi, tôi đi. Nhưng tôi sẽ nhớ mặt bạn.',
] as const;

export function shooReply(rand: () => number): string {
  return SHOO_REPLIES[Math.min(SHOO_REPLIES.length - 1, Math.floor(rand() * SHOO_REPLIES.length))]!;
}
