/** Lễ tân cũng phải ngủ: trưa 12:00–13:00 và đêm 23:00–05:00. Ca đêm kéo tới 07:00 sáng hôm sau. */
export interface SleepWindow {
  id: 'nap' | 'night';
  start: number; // phút trong ca (có thể quá 24h)
  end: number;
  label: string;
}

export const SLEEP_WINDOWS: readonly SleepWindow[] = [
  { id: 'nap', start: 12 * 60, end: 13 * 60, label: 'ngủ trưa' },
  { id: 'night', start: 23 * 60, end: 29 * 60, label: 'ngủ đêm' },
];

export const NIGHT_SHIFT_END = 31 * 60;
export const DROWSY_LEAD = 30; // buồn ngủ từ 30 phút trước giờ ngủ

/** Khung giờ ngủ đang diễn ra. */
export const windowAt = (minute: number): SleepWindow | undefined => SLEEP_WINDOWS.find((w) => minute >= w.start && minute < w.end);

/** Khung giờ ngủ sắp tới trong vòng DROWSY_LEAD phút (đang buồn ngủ). */
export const drowsyFor = (minute: number): SleepWindow | undefined => SLEEP_WINDOWS.find((w) => minute >= w.start - DROWSY_LEAD && minute < w.start);
