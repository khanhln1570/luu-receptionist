import { computeBill, type Bill } from './billing';
import { buildCalendar, holdsNight, type CalendarRow } from './calendar';
import { GameClock } from './clock';
import {
  PATIENCE_FACTOR,
  generateDay,
  randomName,
  randomPersonality,
  type Arrival,
  type DayParams,
} from './guests';
import { GuestQueue, type WaitingGuest } from './queue';
import { checkIn, checkOut, type ExtraCharge, type Reservation } from './reservations';
import { fail, ok, type Result } from './result';
import { Rng } from './rng';
import { transition, type Room, type RoomType } from './rooms';
import { SCORE, clampScore, computeDayResult, meanScore, waitPenalty, type DayResult } from './scoring';
import {
  TIERS,
  fill,
  variablesFor,
  type Effects,
  type Requirement,
  type Scenario,
  type ScenarioType,
} from './scenarios';
import { TaskBoard, type Task, type TaskConfig, type TaskKind } from './tasks';

export interface HotelConfig {
  name: string;
  rooms: readonly Room[]; // phòng 'occupied' lúc đầu là khách đang ở: một phần trả phòng hôm nay, phần còn lại ở tiếp
  params: DayParams;
  staff: TaskConfig['staff'];
  taskMinutes: TaskConfig['minutes'];
}

export interface TickResult {
  arrived: WaitingGuest[];
  left: WaitingGuest[];
  finished: Task[]; // việc buồng phòng/bảo trì vừa xong
}

export interface ScenarioView {
  lines: string[];
  options: { text: string; enabled: boolean; reason?: string }[];
}

export interface GameEvent {
  kind: 'good' | 'bad';
  text: string;
}

export type ChoiceResult = { ok: true; message: string; satisfaction: number } | { ok: false; error: string };

const EXTRA_CHARGES: readonly ExtraCharge[] = [
  { label: 'Minibar', amount: 50_000 },
  { label: 'Giặt ủi', amount: 80_000 },
  { label: 'Hỏng đồ nhỏ', amount: 150_000 },
];

const STAY_LEAVES_TODAY = 0.6; // xác suất một khách ở sẵn trả phòng hôm nay
const REVENUE_TARGET_RATE = 0.8; // mục tiêu = 80% số tiền có thể thu từ khách trả phòng hôm nay

/** Một ngày chơi: đồng hồ, phòng, đặt phòng và hàng chờ. Không biết gì về giao diện. */
export class Game {
  readonly clock: GameClock;
  readonly rooms: Room[];
  readonly reservations: Reservation[];
  readonly queue: GuestQueue;
  readonly tasks: TaskBoard;
  readonly stats = { checkedIn: 0, checkedOut: 0, left: 0, turnedAway: 0, revenue: 0, waived: 0, scenarios: 0, mistakes: 0 };
  /** Doanh thu mục tiêu của ngày: tỉ lệ của tổng hóa đơn các khách sẽ trả phòng hôm nay (0 nếu không có ai). */
  readonly revenueTarget: number;
  readonly events: GameEvent[] = []; // sự kiện đáng nhớ trong ngày, hiện ở màn tổng kết
  private scores: number[] = []; // điểm hài lòng của từng khách đã xong việc
  private mistakes = 0; // số lần chọn sai với khách đang ở quầy
  billing: Bill | null = null; // hóa đơn đang lập cho khách trả phòng ở quầy
  private walkInCount = 0;
  private readonly scenarioById: Map<string, Scenario>;

  constructor(
    readonly config: HotelConfig,
    readonly seed: number,
    scenarios: readonly Scenario[] = [],
  ) {
    this.scenarioById = new Map(scenarios.map((s) => [s.id, s]));
    const pool = (type: ScenarioType) => scenarios.filter((s) => s.type === type);
    const has = (type: ScenarioType) => pool(type).length > 0;

    // Loại tình huống không có kịch bản thì không sinh khách loại đó.
    const params: DayParams = {
      ...config.params,
      incidentRate: has('incident') ? config.params.incidentRate : 0,
      overbookingRate: has('overbooking') ? config.params.overbookingRate : 0,
      specialRate: has('special') ? config.params.specialRate : 0,
      roomTypes: [...new Set(config.rooms.map((r) => r.type))],
    };

    this.clock = new GameClock(params.openMinute, params.closeMinute);
    this.rooms = config.rooms.map((r) => ({ ...r }));
    const rng = new Rng(seed);
    // Chọn tình huống không lặp trong cùng một ngày cho tới khi dùng hết kho của loại đó.
    const used = new Set<string>();
    const pick = (type: ScenarioType): string => {
      const all = pool(type);
      let fresh = all.filter((s) => !used.has(s.id));
      if (fresh.length === 0) {
        for (const s of all) used.delete(s.id);
        fresh = all;
      }
      const id = rng.pick(fresh).id;
      used.add(id);
      return id;
    };
    const day = generateDay(rng, params);
    this.reservations = day.reservations;
    for (const r of this.reservations) {
      r.arrivalDay = 0;
      r.departDay = r.nights;
    }
    const arrivals: Arrival[] = [...day.arrivals];

    for (const a of arrivals) {
      if (a.kind === 'special' || a.kind === 'overbooking') a.scenarioId = pick(a.kind);
    }

    let expectedCheckoutRevenue = 0;
    // Khách ở sẵn: một phần trả phòng buổi sáng đến đầu giờ chiều, phần còn lại ở tiếp và có thể báo sự cố.
    this.rooms
      .filter((r) => r.status === 'occupied')
      .forEach((room, i) => {
        const n = i + 1;
        const guestName = randomName(rng);
        const res: Reservation = {
          id: `h${n}`,
          code: `HM-H${String(n).padStart(2, '0')}`,
          guestName,
          roomType: room.type,
          nights: rng.int(1, 3),
          status: 'checked_in',
          roomId: room.id,
          charges: rng.chance(0.4) ? [rng.pick(EXTRA_CHARGES)] : [],
        };
        this.reservations.push(res);
        const personality = randomPersonality(rng);
        const base = {
          guestName,
          personality,
          patienceMinutes: Math.round(params.patienceMinutes * PATIENCE_FACTOR[personality]),
          roomType: room.type,
          reservationCode: res.code,
          roomId: room.id,
        };
        const leavesToday = rng.chance(STAY_LEAVES_TODAY);
        res.departDay = leavesToday ? 0 : 1 + (n % 2);
        res.arrivalDay = res.departDay - res.nights;
        if (leavesToday) {
          expectedCheckoutRevenue += computeBill(res, room).total;
          arrivals.push({ ...base, id: `c${n}`, kind: 'checkout', arrivalMinute: rng.int(params.openMinute, params.openMinute + 6 * 60) });
        } else if (params.incidentRate && rng.chance(params.incidentRate)) {
          arrivals.push({
            ...base,
            id: `i${n}`,
            kind: 'incident',
            arrivalMinute: rng.int(params.openMinute + 30, params.closeMinute - 120),
            scenarioId: pick('incident'),
          });
        }
      });

    this.futureBookings = this.makeFutureBookings(seed);
    this.revenueTarget = Math.round(REVENUE_TARGET_RATE * expectedCheckoutRevenue);
    this.queue = new GuestQueue(arrivals);
    this.tasks = new TaskBoard(this.rooms, { staff: config.staff, minutes: config.taskMinutes });
  }

  /** Đặt phòng cho những ngày sau (chỉ để xem lịch, chưa nhận phòng được hôm nay). */
  readonly futureBookings: Reservation[];

  /** Số phòng bị giữ theo loại và theo đêm trong `days` ngày tới (đêm đầu là đêm nay). */
  calendar(days = 7): CalendarRow[] {
    const totals = { don: 0, doi: 0, vip: 0 } as Record<RoomType, number>;
    for (const r of this.rooms) totals[r.type] += 1;
    return buildCalendar(TIERS, totals, [...this.reservations, ...this.futureBookings], days);
  }

  /** Sinh đặt phòng tương lai cho từng loại phòng, không vượt số phòng. Dùng bộ ngẫu nhiên riêng để không đổi lịch khách trong ngày. */
  private makeFutureBookings(seed: number): Reservation[] {
    const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    const out: Reservation[] = [];
    const totals = { don: 0, doi: 0, vip: 0 } as Record<RoomType, number>;
    for (const r of this.rooms) totals[r.type] += 1;
    const held = (type: RoomType, d: number) =>
      [...this.reservations, ...out].filter((r) => r.roomType === type && holdsNight(r, d)).length;
    let n = 0;
    for (const type of TIERS) {
      if (totals[type] === 0) continue;
      for (let day = 1; day <= 6; day++) {
        const target = Math.round(totals[type] * (0.35 + rng.next() * 0.45));
        while (held(type, day) < target) {
          const nights = rng.int(1, 3);
          let fits = true;
          for (let d = day; d < day + nights; d++) if (held(type, d) >= totals[type]) fits = false;
          if (!fits) break;
          n += 1;
          out.push({
            id: `f${n}`,
            code: `HM-F${String(n).padStart(2, '0')}`,
            guestName: randomName(rng),
            roomType: type,
            nights,
            arrivalDay: day,
            departDay: day + nights,
            status: 'booked',
            charges: [],
          });
        }
      }
    }
    return out;
  }

  /** Hài lòng trung bình hiện tại (0..100). */
  get satisfaction(): number {
    return Math.round(meanScore(this.scores));
  }

  get guestScores(): readonly number[] {
    return this.scores;
  }

  /** Kết quả cả ngày: hài lòng, doanh thu so với mục tiêu và số sao. */
  get result(): DayResult {
    return computeDayResult({
      scores: this.scores,
      unservedGuests: this.queue.waiting.length + (this.queue.current ? 1 : 0),
      revenue: this.stats.revenue,
      revenueTarget: this.revenueTarget,
    });
  }

  get isOver(): boolean {
    return this.clock.isOver;
  }

  /** Khách chưa được phục vụ khi hết ngày (đang chờ, đang ở quầy hoặc chưa kịp đến). */
  get unserved(): number {
    return this.queue.waiting.length + (this.queue.current ? 1 : 0) + this.queue.pendingCount;
  }

  tick(deltaMinutes: number): TickResult {
    if (this.isOver) return { arrived: [], left: [], finished: [] };
    this.clock.advance(deltaMinutes);
    const left = this.queue.tick(deltaMinutes);
    const arrived = this.queue.admit(this.clock.minute);
    const finished = this.tasks.tick(deltaMinutes);
    this.stats.left += left.length;
    for (const g of left) {
      this.scores.push(SCORE.left);
      this.events.push({ kind: 'bad', text: `${g.arrival.guestName} chờ quá lâu nên bỏ đi.` });
    }
    return { arrived, left, finished };
  }

  /** Giao việc dọn phòng, sửa chữa, hoặc việc tại phòng có khách. */
  assignTask(roomId: string, kind: TaskKind): Result {
    return this.tasks.assign(roomId, kind);
  }

  callNext(): WaitingGuest | null {
    return this.queue.callNext();
  }

  /** Ghi điểm cho khách đang ở quầy (trừ điểm chờ lâu và sai sót) rồi cho khách rời quầy. */
  private finishGuest(base: number, bonus = 0): void {
    const cur = this.queue.current!;
    const wait = waitPenalty(cur.patienceLeft, cur.arrival.patienceMinutes);
    this.scores.push(clampScore(base + bonus - wait - SCORE.mistakePenalty * this.mistakes));
    this.mistakes = 0;
    this.queue.finishCurrent();
  }

  /** Lỗi do người chơi chọn sai với khách đang ở quầy: bị tính một sai sót. */
  private mistake(message: string): Result {
    this.mistakes += 1;
    this.stats.mistakes += 1;
    return fail(message);
  }

  /** Cho khách ở quầy ra về mà không phục vụ (từ chối khách đến nhận phòng). */
  dismissCurrent(): Result {
    const cur = this.queue.current;
    if (!cur) return fail('Chưa có khách ở quầy');
    if (cur.arrival.kind !== 'checkin' && cur.arrival.kind !== 'walkin') return fail('Khách này cần được xử lý, không thể từ chối');
    this.stats.turnedAway += 1;
    this.scores.push(SCORE.turnedAway);
    this.events.push({ kind: 'bad', text: `Bạn từ chối khách ${cur.arrival.guestName}.` });
    this.mistakes = 0;
    this.queue.finishCurrent();
    return ok;
  }

  /** Đuổi một khách đang chờ (chưa tới quầy) ra về; tính như từ chối khách. */
  shooWaiting(arrivalId: string): Result {
    const i = this.queue.waiting.findIndex((w) => w.arrival.id === arrivalId);
    if (i < 0) return fail('Khách này không còn trong hàng chờ');
    const w = this.queue.waiting[i]!;
    if (w.arrival.kind !== 'checkin' && w.arrival.kind !== 'walkin') return fail('Khách này cần được xử lý, không thể đuổi');
    this.queue.waiting.splice(i, 1);
    this.stats.turnedAway += 1;
    this.scores.push(SCORE.turnedAway);
    this.events.push({ kind: 'bad', text: `Bạn đuổi khách ${w.arrival.guestName} về.` });
    return ok;
  }

  /** Khách đặt trước: người chơi chọn đặt phòng và một phòng. */
  attemptCheckIn(reservationId: string, roomId: string): Result {
    const current = this.queue.current;
    if (!current) return fail('Chưa có khách ở quầy');
    if (current.arrival.kind !== 'checkin') return this.mistake('Khách này không đến nhận phòng đặt trước');
    const res = this.reservations.find((r) => r.id === reservationId);
    const room = this.rooms.find((r) => r.id === roomId);
    if (!res || !room) return this.mistake('Không tìm thấy đặt phòng hoặc phòng');
    if (res.code !== current.arrival.reservationCode) {
      return this.mistake(`Đây không phải đặt phòng của khách ${current.arrival.guestName}`);
    }
    const result = checkIn(res, room);
    if (!result.ok) return this.mistake(result.error);
    this.stats.checkedIn += 1;
    this.finishGuest(SCORE.served);
    return ok;
  }

  /** Khách vãng lai: chỉ cần chọn phòng, hệ thống tạo đặt phòng tại quầy. */
  attemptWalkIn(roomId: string): Result {
    const current = this.queue.current;
    if (!current) return fail('Chưa có khách ở quầy');
    const a = current.arrival;
    if (a.kind !== 'walkin') return this.mistake('Khách này không phải khách vãng lai');
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) return this.mistake('Không tìm thấy phòng');
    const n = this.walkInCount + 1;
    const res: Reservation = {
      id: `w${n}`,
      code: `WI-${n}`,
      guestName: a.guestName,
      roomType: a.roomType,
      nights: 1 + (Number(a.id.slice(1)) % 3),
      arrivalDay: 0,
      departDay: 1 + (Number(a.id.slice(1)) % 3),
      status: 'booked',
      charges: [],
    };
    const result = checkIn(res, room);
    if (!result.ok) return this.mistake(result.error);
    this.walkInCount = n;
    this.reservations.push(res);
    this.stats.checkedIn += 1;
    this.finishGuest(SCORE.served);
    return ok;
  }

  /** Khách trả phòng: chọn đặt phòng và phòng khách đang ở để lập hóa đơn. */
  startCheckOut(reservationId: string, roomId: string): Result {
    const current = this.queue.current;
    if (!current) return fail('Chưa có khách ở quầy');
    if (current.arrival.kind !== 'checkout') return this.mistake('Khách này không đến trả phòng');
    const res = this.reservations.find((r) => r.id === reservationId);
    const room = this.rooms.find((r) => r.id === roomId);
    if (!res || !room) return this.mistake('Không tìm thấy đặt phòng hoặc phòng');
    if (res.code !== current.arrival.reservationCode) {
      return this.mistake(`Đây không phải đặt phòng của khách ${current.arrival.guestName}`);
    }
    if (res.status !== 'checked_in' || res.roomId !== room.id) {
      return this.mistake(`Khách ${res.guestName} không ở phòng ${room.id}`);
    }
    this.billing = computeBill(res, room);
    return ok;
  }

  cancelBill(): void {
    this.billing = null;
  }

  /** Thu tiền theo hóa đơn. waiveCharges = true: miễn phụ phí, chỉ thu tiền phòng. */
  settleBill(waiveCharges: boolean): Result {
    const bill = this.billing;
    if (!bill) return fail('Chưa có hóa đơn');
    const res = this.reservations.find((r) => r.id === bill.reservationId)!;
    const room = this.rooms.find((r) => r.id === bill.roomId)!;
    const result = checkOut(res, room);
    if (!result.ok) return result;
    this.stats.revenue += waiveCharges ? bill.base : bill.total;
    this.stats.waived += waiveCharges ? bill.chargesTotal : 0;
    this.stats.checkedOut += 1;
    this.billing = null;
    const waived = waiveCharges && bill.chargesTotal > 0;
    if (waived) this.events.push({ kind: 'good', text: `Bạn miễn phụ phí ${bill.chargesTotal.toLocaleString('vi-VN')}đ cho ${bill.guestName}.` });
    this.finishGuest(SCORE.served, waived ? SCORE.waivedBonus : 0);
    return ok;
  }

  // ---- Tình huống (sự cố, overbooking, đặc biệt) ----

  private scenarioOf(arrival: Arrival): Scenario | undefined {
    return arrival.scenarioId ? this.scenarioById.get(arrival.scenarioId) : undefined;
  }

  /** Loại phòng làm gốc cho tình huống: loại phòng đã đặt hoặc đang ở. */
  private contextType(arrival: Arrival): RoomType {
    return this.reservations.find((r) => r.code === arrival.reservationCode)?.roomType ?? arrival.roomType;
  }

  /** Phòng trống, sạch phù hợp: cùng loại, loại cao hơn gần nhất, hoặc loại thấp hơn gần nhất. */
  private findRoomFor(req: Requirement, type: RoomType): Room | undefined {
    const idx = TIERS.indexOf(type);
    const tiers =
      req === 'spareRoom' ? [type] : req === 'upgradeRoom' ? TIERS.slice(idx + 1) : TIERS.slice(0, idx).reverse();
    for (const t of tiers) {
      const room = this.rooms.filter((r) => r.status === 'vacant_clean' && r.type === t).sort((a, b) => a.id.localeCompare(b.id))[0];
      if (room) return room;
    }
    return undefined;
  }

  /** Nội dung tình huống của khách đang ở quầy (đã thay biến) kèm trạng thái từng lựa chọn. */
  currentScenario(): ScenarioView | null {
    const cur = this.queue.current;
    const sc = cur && this.scenarioOf(cur.arrival);
    if (!cur || !sc) return null;
    const a = cur.arrival;
    const type = this.contextType(a);
    const vars = variablesFor(a.guestName, a.roomId, type);
    return {
      lines: sc.lines.map((l) => fill(l, vars)),
      options: sc.options.map((o) => {
        const enabled = !o.requires || !!this.findRoomFor(o.requires, type);
        return { text: fill(o.text, vars), enabled, reason: enabled ? undefined : 'Không còn phòng phù hợp' };
      }),
    };
  }

  /** Người chơi chọn một cách xử lý; áp dụng hiệu ứng và cho khách rời quầy. */
  chooseOption(index: number): ChoiceResult {
    const cur = this.queue.current;
    const sc = cur && this.scenarioOf(cur.arrival);
    if (!cur || !sc) return fail('Khách này không có tình huống cần xử lý') as ChoiceResult;
    const opt = sc.options[index];
    if (!opt) return fail('Lựa chọn không tồn tại') as ChoiceResult;

    const a = cur.arrival;
    const type = this.contextType(a);
    const res = this.reservations.find((r) => r.code === a.reservationCode);
    const target = opt.requires ? this.findRoomFor(opt.requires, type) : undefined;
    if (opt.requires && !target) return fail('Không còn phòng phù hợp') as ChoiceResult;

    this.applyEffects(opt.effects, res, target);
    this.stats.scenarios += 1;
    const delta = opt.effects.satisfaction ?? 0;
    const message = fill(opt.result, variablesFor(a.guestName, a.roomId, type));
    if (Math.abs(delta) >= 10 || (opt.effects.money ?? 0) <= -100_000) {
      this.events.push({ kind: delta >= 0 ? 'good' : 'bad', text: `${a.guestName}: ${message}` });
    }
    this.finishGuest(SCORE.scenarioBase + delta * SCORE.scenarioPerPoint);
    return { ok: true, message, satisfaction: delta };
  }

  private applyEffects(e: Effects, res: Reservation | undefined, target: Room | undefined): void {
    if (e.moveRoom && res && target) {
      const old = this.rooms.find((r) => r.id === res.roomId)!;
      transition(target, 'occupied');
      transition(old, e.oldRoom ?? 'dirty');
      res.roomId = target.id;
    }
    if (e.checkIn && res && target) {
      transition(target, 'occupied');
      res.status = 'checked_in';
      res.roomId = target.id;
      this.stats.checkedIn += 1;
    }
    if (e.cancel && res) {
      res.status = 'cancelled';
      this.stats.turnedAway += 1;
    }
    if (e.task && res?.roomId) this.tasks.assign(res.roomId, e.task);
    if (e.money) this.stats.revenue += e.money;
  }
}
