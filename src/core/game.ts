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
import { isPaid, serviceFor, servicePrice, type PaidKind } from './pricing';
import { REGULAR, type RegularOutcome, type RegularVisit } from './regulars';
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
import { VISITOR, generateVisitors, visitorReply, type Visitor, type VisitorOutcome } from './visitors';

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

/** Thứ ngoài lịch khách thường mà Game nhận vào: hiện chỉ có khách quen của ngày. */
export interface GameExtras {
  regularVisits?: readonly RegularVisit[];
  ownerVisit?: Scenario; // chủ khách sạn ghé quầy hôm nay
  extraScenarios?: readonly Scenario[]; // tình huống ngoài kho thường, để thử bằng triggerScenario
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
  readonly stats = { checkedIn: 0, checkedOut: 0, left: 0, turnedAway: 0, revenue: 0, waived: 0, scenarios: 0, mistakes: 0, serviceCost: 0 };
  /** Doanh thu mục tiêu của ngày: tỉ lệ của tổng hóa đơn các khách sẽ trả phòng hôm nay (0 nếu không có ai). */
  readonly revenueTarget: number;
  readonly events: GameEvent[] = []; // sự kiện đáng nhớ trong ngày, hiện ở màn tổng kết
  private scores: number[] = []; // điểm hài lòng của từng khách đã xong việc
  private mistakes = 0; // số lần chọn sai với khách đang ở quầy
  billing: Bill | null = null; // hóa đơn đang lập cho khách trả phòng ở quầy
  readonly visitors: Visitor[]; // người lạ trong sảnh có vai ẩn
  private visitorFate = new Map<string, 'shooed' | 'treated'>();
  /** Biến cố trong ngày ảnh hưởng danh tiếng (review của nhà phê bình, khách quen...), cộng vào thay đổi theo sao. */
  reputationBonus = 0;
  readonly regularOutcomes: RegularOutcome[] = []; // kết quả các lần ghé của khách quen hôm nay
  private regularVisits = new Map<string, RegularVisit>();
  private walkInCount = 0;
  private readonly scenarioById: Map<string, Scenario>;

  constructor(
    readonly config: HotelConfig,
    readonly seed: number,
    scenarios: readonly Scenario[] = [],
    extras: GameExtras = {},
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

    // Khách quen và người lạ dùng bộ ngẫu nhiên riêng để không đổi lịch khách thường của cùng seed.
    const extraRng = new Rng((seed ^ 0x51ed270b) >>> 0);
    (extras.regularVisits ?? []).forEach((v, i) => {
      const id = `rg${i + 1}`;
      this.scenarioById.set(v.scenario.id, v.scenario);
      this.regularVisits.set(id, v);
      arrivals.push({
        id,
        arrivalMinute: extraRng.int(params.openMinute + 30, Math.max(params.openMinute + 31, params.closeMinute - 150)),
        kind: 'special',
        guestName: v.regular.name,
        personality: v.regular.personality,
        patienceMinutes: Math.round(params.patienceMinutes * PATIENCE_FACTOR[v.regular.personality]),
        roomType: v.regular.roomType,
        scenarioId: v.scenario.id,
        regularId: v.regular.id,
      });
    });
    for (const sc of extras.extraScenarios ?? []) this.scenarioById.set(sc.id, sc);
    if (extras.ownerVisit) {
      this.scenarioById.set(extras.ownerVisit.id, extras.ownerVisit);
      arrivals.push({
        id: 'owner',
        arrivalMinute: extraRng.int(params.openMinute + 120, Math.max(params.openMinute + 121, params.closeMinute - 180)),
        kind: 'special',
        guestName: extras.ownerVisit.guest ?? 'Chủ khách sạn',
        personality: 'kien_nhan',
        patienceMinutes: Math.round(params.patienceMinutes * PATIENCE_FACTOR.kien_nhan),
        roomType: this.rooms[0]?.type ?? 'don',
        scenarioId: extras.ownerVisit.id,
      });
    }
    this.visitors = generateVisitors(new Rng((seed ^ 0x7f4a7c15) >>> 0), params.openMinute, params.closeMinute);

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
    const r = this.tasks.assign(roomId, kind);
    const room = this.rooms.find((x) => x.id === roomId);
    if (r.ok && room && isPaid(kind)) {
      const price = servicePrice(room, kind);
      this.stats.revenue -= price;
      this.stats.serviceCost += price;
    }
    return r;
  }

  /** Phòng đang cần dọn hoặc sửa mà chưa giao việc, kèm giá dịch vụ (để báo trên chuông thông báo). */
  needsService(): Array<{ roomId: string; type: RoomType; kind: PaidKind; price: number }> {
    return this.rooms.flatMap((r) => {
      const kind = serviceFor(r.status);
      return kind && !this.tasks.taskFor(r.id) ? [{ roomId: r.id, type: r.type, kind, price: servicePrice(r, kind) }] : [];
    });
  }

  /** Báo giá giao việc cho một phòng: null nếu phòng không cần dọn/sửa hoặc đã giao rồi. */
  quoteService(roomId: string): { roomId: string; type: RoomType; kind: PaidKind; price: number; minutes: number } | null {
    const n = this.needsService().find((x) => x.roomId === roomId);
    return n ? { ...n, minutes: this.config.taskMinutes[n.kind] } : null;
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

  /** Kịch bản của một lượt khách (cho lễ tân tự động cân nhắc lựa chọn). */
  scenarioFor(arrival: Arrival): Scenario | undefined {
    return this.scenarioOf(arrival);
  }

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
    if (a.regularId) this.recordRegular(a, delta);
    if (a.id === 'owner' || sc.guest) this.reputationBonus += delta >= 5 ? 3 : delta <= -5 ? -3 : 0; // chủ khách sạn nhận xét: ảnh hưởng danh tiếng
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

  // ---- Thử tình huống ----

  private triggered = 0;

  /**
   * Cho một tình huống xảy ra ngay: tạo khách mang tình huống đó vào hàng chờ (và gọi ra quầy nếu quầy đang trống).
   * Sự cố cần một khách đang ở khách sạn; đặt trùng phòng thì tạo thêm một đặt phòng hôm nay cho khách.
   */
  triggerScenario(id: string): Result {
    const sc = this.scenarioById.get(id);
    if (!sc) return fail('Không có tình huống này');
    if (this.isOver) return fail('Đã hết ngày');
    const n = ++this.triggered;
    const rng = new Rng((this.seed + n * 7919) >>> 0);
    const inQueue = new Set([...this.queue.waiting, ...(this.queue.current ? [this.queue.current] : [])].map((w) => w.arrival.reservationCode));
    const base: Arrival = {
      id: `t${n}`,
      arrivalMinute: this.clock.minute,
      kind: sc.type,
      guestName: sc.guest ?? randomName(rng),
      personality: 'de_tinh',
      patienceMinutes: Math.round(this.config.params.patienceMinutes * PATIENCE_FACTOR.de_tinh),
      roomType: this.rooms[0]?.type ?? 'don',
      scenarioId: sc.id,
    };
    if (sc.type === 'incident') {
      const stay = this.reservations.find((r) => r.status === 'checked_in' && r.roomId && !inQueue.has(r.code));
      if (!stay) return fail('Chưa có khách nào đang ở khách sạn để báo sự cố');
      Object.assign(base, { guestName: stay.guestName, roomType: stay.roomType, reservationCode: stay.code, roomId: stay.roomId });
    } else if (sc.type === 'overbooking') {
      const res: Reservation = {
        id: `t${n}`,
        code: `TT-${n}`,
        guestName: base.guestName,
        roomType: base.roomType,
        nights: 1,
        arrivalDay: 0,
        departDay: 1,
        status: 'booked',
        charges: [],
      };
      this.reservations.push(res);
      base.reservationCode = res.code;
    }
    this.queue.enqueue(base);
    this.callNext(); // quầy đang trống thì khách vào quầy luôn
    return ok;
  }

  // ---- Khách quen ----

  /** Ghi kết quả một lần ghé của khách quen; lần cuối mà họ đủ hài lòng thì thành bạn của khách sạn. */
  private recordRegular(a: Arrival, satisfaction: number): void {
    const v = this.regularVisits.get(a.id);
    if (!v) return;
    const becameFriend = v.finale && v.mood + satisfaction >= REGULAR.friendMood;
    this.regularOutcomes.push({ id: v.regular.id, satisfaction, finale: v.finale, becameFriend });
    if (becameFriend) {
      this.stats.revenue += REGULAR.friendBonus;
      this.reputationBonus += 5;
      this.events.push({ kind: 'good', text: `${v.regular.name} đã thành bạn của khách sạn. ${v.regular.farewell}` });
    } else if (satisfaction >= 5) this.reputationBonus += 2;
    else if (satisfaction <= -8) {
      this.reputationBonus -= 3;
      this.events.push({ kind: 'bad', text: `${v.regular.name} ra về buồn bã, khó mà quay lại.` });
    }
  }

  // ---- Người lạ trong sảnh ----

  /** Người lạ đang có mặt ở sảnh: đã tới giờ, chưa hết giờ ở và chưa bị xử lý. */
  activeVisitors(): Visitor[] {
    const now = this.clock.minute;
    return this.visitors.filter((v) => !this.visitorFate.has(v.id) && now >= v.arrivalMinute && now < v.arrivalMinute + v.stayMinutes && !this.isOver);
  }

  /** Hỏi thăm một người lạ: thường là manh mối về vai của họ. null nếu người đó không còn ở sảnh. */
  askVisitor(id: string, rand: () => number = Math.random): string | null {
    const v = this.activeVisitors().find((x) => x.id === id);
    return v ? visitorReply(v, rand) : null;
  }

  /** Mời người lạ ra về. Đuổi nhầm nhà phê bình thì bị chấm một sao. */
  shooVisitor(id: string): VisitorOutcome {
    const v = this.activeVisitors().find((x) => x.id === id);
    if (!v) return { ok: false, error: 'Người này đã đi khỏi' };
    this.visitorFate.set(id, 'shooed');
    if (v.role === 'critic') {
      this.scores.push(VISITOR.criticShooed);
      this.reputationBonus -= 10;
      this.events.push({ kind: 'bad', text: `${v.name} hóa ra là nhà phê bình, vừa bị bạn đuổi. Review một sao đang được viết.` });
      return { ok: true, good: false, message: 'Tôi là nhà phê bình đó! Review một sao nhé.' };
    }
    if (v.role === 'spy') {
      this.scores.push(VISITOR.spyShooed);
      this.reputationBonus += 2;
      this.events.push({ kind: 'good', text: `Bạn phát hiện ${v.name} là gián điệp của đối thủ và mời ra khỏi sảnh.` });
      return { ok: true, good: true, message: 'Bị phát hiện rồi… tôi đi đây!' };
    }
    this.reputationBonus += 1;
    return { ok: true, good: true, message: 'Được rồi, tôi đi. Máy lạnh chỗ khác cũng mát.' };
  }

  /** Mời nước một người lạ: tốn tiền, nhưng nhà phê bình sẽ khen. */
  treatVisitor(id: string): VisitorOutcome {
    const v = this.activeVisitors().find((x) => x.id === id);
    if (!v) return { ok: false, error: 'Người này đã đi khỏi' };
    this.visitorFate.set(id, 'treated');
    this.stats.revenue -= VISITOR.drinkCost;
    if (v.role === 'critic') {
      this.scores.push(VISITOR.criticPraised);
      this.stats.revenue += VISITOR.criticTip;
      this.reputationBonus += 8;
      this.events.push({ kind: 'good', text: `${v.name} là nhà phê bình, rất hài lòng vì được phục vụ chu đáo. Bài review tốt kéo thêm khách.` });
      return { ok: true, good: true, message: 'Phục vụ chu đáo đó. Tôi sẽ viết review tốt.' };
    }
    if (v.role === 'spy') {
      this.reputationBonus -= 3;
      this.events.push({ kind: 'bad', text: `${v.name} hóa ra là gián điệp, vừa được bạn mời nước và ghi lại hết bí quyết của khách sạn.` });
      return { ok: true, good: false, message: 'Cảm ơn nha. Nước ngon, bí quyết cũng ngon luôn.' };
    }
    return { ok: true, good: false, message: 'Ly nước ngon quá, cho thêm ly nữa nha!' };
  }

  /** Mời nước một khách đang ở khách sạn ngồi chơi ở sảnh: chỉ tốn tiền. */
  treatGuest(): VisitorOutcome {
    this.stats.revenue -= VISITOR.drinkCost;
    return { ok: true, good: true, message: 'Cảm ơn bạn nhiều, tôi ngồi thế này là đủ rồi.' };
  }
}
