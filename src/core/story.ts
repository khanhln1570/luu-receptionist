export interface Owner {
  name: string;
  title: string;
}

export interface Chapter {
  /** Số ngày đạt cần có để mở chương này (0 = mở ngay sau ngày chơi đầu tiên). */
  when: number;
  title: string;
  lines: string[];
}

export interface HotelStory {
  owner: Owner;
  chapters: readonly Chapter[];
  /** Lời nhận xét cuối ngày theo mức sao: thấp (≤ 2), vừa (3), cao (≥ 4). */
  daily: Record<'low' | 'mid' | 'high', readonly string[]>;
}

export interface StoryBeat {
  owner: Owner;
  chapter?: string; // tên chương nếu là đoạn truyện mới mở
  lines: string[];
}

interface Counts {
  days: number;
  goodDays: number;
}

/**
 * Đoạn thoại của chủ khách sạn sau một ngày. `seen` là số chương đã kể: chương kế tiếp mở khi đủ ngày đạt
 * (mỗi ngày tối đa một chương, không bỏ sót chương nào). Chưa có chương mới thì nói một câu nhận xét
 * theo số sao, xoay vòng theo số ngày đã chơi.
 */
export function storyFor(story: HotelStory | undefined, seen: number, after: Counts, stars: number): { beat: StoryBeat | null; seen: number } {
  if (!story) return { beat: null, seen };
  const next = story.chapters[seen];
  if (next && after.days >= 1 && after.goodDays >= next.when) {
    return { beat: { owner: story.owner, chapter: next.title, lines: next.lines }, seen: seen + 1 };
  }
  const pool = story.daily[stars <= 2 ? 'low' : stars === 3 ? 'mid' : 'high'];
  const line = pool[after.days % pool.length];
  return { beat: line ? { owner: story.owner, lines: [line] } : null, seen };
}
