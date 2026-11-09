import type { Arrival } from './guests';

export interface WaitingGuest {
  arrival: Arrival;
  patienceLeft: number; // phút còn lại
}

/** Hàng chờ ở quầy. Khách đang được phục vụ không bị trừ kiên nhẫn. */
export class GuestQueue {
  private pending: Arrival[];
  readonly waiting: WaitingGuest[] = [];
  current: WaitingGuest | null = null;

  constructor(arrivals: readonly Arrival[]) {
    this.pending = [...arrivals].sort((a, b) => a.arrivalMinute - b.arrivalMinute);
  }

  /** Đưa khách đã đến giờ vào hàng chờ, trả về những khách mới vào. */
  admit(nowMinute: number): WaitingGuest[] {
    const entered: WaitingGuest[] = [];
    while (this.pending.length > 0 && this.pending[0]!.arrivalMinute <= nowMinute) {
      const arrival = this.pending.shift()!;
      const g: WaitingGuest = { arrival, patienceLeft: arrival.patienceMinutes };
      this.waiting.push(g);
      entered.push(g);
    }
    return entered;
  }

  /** Trừ kiên nhẫn của khách đang chờ; trả về những khách hết kiên nhẫn và đã bỏ đi. */
  tick(deltaMinutes: number): WaitingGuest[] {
    const left: WaitingGuest[] = [];
    for (const g of [...this.waiting]) {
      g.patienceLeft -= deltaMinutes;
      if (g.patienceLeft <= 0) {
        this.waiting.splice(this.waiting.indexOf(g), 1);
        left.push(g);
      }
    }
    return left;
  }

  /** Gọi khách đầu hàng vào phục vụ. Trả null nếu đang bận hoặc hàng trống. */
  callNext(): WaitingGuest | null {
    if (this.current || this.waiting.length === 0) return null;
    this.current = this.waiting.shift()!;
    return this.current;
  }

  /** Xong việc với khách hiện tại. */
  finishCurrent(): void {
    this.current = null;
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
