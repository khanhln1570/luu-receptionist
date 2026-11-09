/** Câu trả lời ngẫu nhiên khi lễ tân bấm vào một người trong sảnh và hỏi thăm. */
export const SMALL_TALK = [
  'Tôi tới coi phòng thôi.',
  'Kệ tôi, làm việc của mình đi.',
  '(im lặng) …',
  'Tôi đi cùng với người khác.',
  'Tôi vào nhầm khách sạn.',
  'Hỏi thăm gì, lo check-in cho người ta nhanh lên kìa.',
  'Wifi pass là gì? À thôi, nhìn sảnh là biết yếu rồi.',
  'Lễ tân rảnh quá ha, đi hỏi chuyện từng người.',
  'Tôi đợi bạn tôi… mà chắc nó cũng vào nhầm khách sạn rồi.',
  'Đừng nhìn tôi vậy, tôi trả tiền cái ghế này bằng ánh mắt rồi.',
  'Đi ngang thấy cửa mở thì vào thôi, có gì đâu.',
  'Bạn hỏi thăm khách nào cũng nhiệt tình vậy hả? Đáng ngờ đó.',
  'Tôi đang chấm điểm bài kiểm tra của học sinh, nghề giáo mà.',
  'Tôi xem giá phòng chơi thôi, nhà tôi ở ngay gần đây.',
  'Tôi chỉ ngồi đợi taxi, bạn đừng nhìn tôi như thanh tra vậy.',
  'Cái sofa này lún quá, ngồi xuống là gặp đất.',
  'Sảnh này cũ rồi, sơn lại cái đi chứ.',
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
  'Ghê chưa, mới làm lễ tân mà tưởng làm giám đốc.',
  'Đuổi khách kiểu này thì sớm đóng cửa thôi.',
  'Tôi đi đây, ở lại chắc bị tính phí thở.',
  'Hừ! 😤',
  'Review: lễ tân 0 điểm, ghế sofa 10 điểm.',
  'Ủa alo? Tôi là khách VIP tương lai đó nha!',
  'Không ở thì thôi, ai thèm. Hứ!',
  'Mai tôi dẫn cả họ qua khách sạn bên kia.',
  'Chụp lại rồi nha, lên group review liền.',
  'Thái độ vậy là mất một khách trung thành rồi đó.',
  'Lần sau có mời tôi cũng không tới.',
  'Đi thì đi, nhưng tôi lấy thêm cái kẹo ở quầy.',
  'Biết vậy tôi ở nhà nằm điều hòa cho sướng.',
  '@#!*& … thôi kệ, không thèm chấp. 😒',
] as const;

/** Câu than phiền biến mất khi khách sạn đã nâng cấp món tương ứng. */
export const UPGRADE_COMPLAINTS: Record<string, readonly string[]> = {
  wifi: ['Wifi pass là gì? À thôi, nhìn sảnh là biết yếu rồi.'],
  sofa: ['Cái sofa này lún quá, ngồi xuống là gặp đất.'],
  renovate: ['Sảnh này cũ rồi, sơn lại cái đi chứ.'],
};

/** Câu khen chỉ xuất hiện sau khi nâng cấp. */
export const UPGRADE_PRAISE: Record<string, readonly string[]> = {
  wifi: ['Wifi ở đây mạnh ghê, tôi họp online ngay ở sảnh luôn.'],
  sofa: ['Sofa mới êm thiệt, ngồi là buồn ngủ liền.'],
  renovate: ['Sảnh mới sơn thơm mùi gỗ, tôi khoái chỗ này rồi.'],
  housekeeper: ['Phòng sạch bóng, buồng phòng ở đây nhanh tay thiệt.'],
  maintenance: ['Hôm qua cái quạt hư, nửa tiếng sau có người sửa liền, đã ghê.'],
};

/** Kho câu hỏi thăm theo các món đã nâng cấp: bỏ câu than phiền cũ, thêm câu khen mới. */
export function talkPool(owned: readonly string[]): string[] {
  const gone = new Set(owned.flatMap((id) => UPGRADE_COMPLAINTS[id] ?? []));
  return [...SMALL_TALK.filter((l) => !gone.has(l)), ...owned.flatMap((id) => UPGRADE_PRAISE[id] ?? [])];
}
