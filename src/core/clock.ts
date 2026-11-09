/** Đồng hồ game tính bằng phút trong ngày (0 = 00:00). Người gọi quyết định khi nào tick, nên tạm dừng là không tick. */
export class GameClock {
  minute: number;

  constructor(
    readonly openMinute = 8 * 60,
    readonly closeMinute = 22 * 60,
  ) {
    this.minute = openMinute;
  }

  advance(deltaMinutes: number): void {
    this.minute = Math.min(this.minute + deltaMinutes, this.closeMinute);
  }

  get isOver(): boolean {
    return this.minute >= this.closeMinute;
  }

  format(): string {
    return formatMinute(this.minute);
  }
}

export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
