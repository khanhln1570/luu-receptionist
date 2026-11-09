import { fail, ok, type Result } from './result';
import { transition, type Room, type RoomStatus } from './rooms';

/**
 * cleaning: dọn phòng chưa dọn; repair: sửa phòng hỏng (phòng đổi trạng thái).
 * service: buồng phòng làm việc tại phòng có khách; fix: bảo trì sửa nhỏ tại phòng có khách (phòng vẫn có khách).
 */
export type TaskKind = 'cleaning' | 'repair' | 'service' | 'fix';
export type CrewGroup = 'housekeeping' | 'maintenance';

export interface Task {
  id: string;
  roomId: string;
  kind: TaskKind;
  status: 'queued' | 'working';
  minutesLeft: number;
}

export interface TaskConfig {
  staff: Record<CrewGroup, number>;
  minutes: Record<TaskKind, number>;
}

const REQUIRES: Record<TaskKind, RoomStatus> = { cleaning: 'dirty', repair: 'broken', service: 'occupied', fix: 'occupied' };
const WHILE_WORKING: Partial<Record<TaskKind, RoomStatus>> = { cleaning: 'cleaning', repair: 'repairing' };
const GROUP: Record<TaskKind, CrewGroup> = { cleaning: 'housekeeping', service: 'housekeeping', repair: 'maintenance', fix: 'maintenance' };
const KIND_LABEL: Record<TaskKind, string> = { cleaning: 'dọn phòng', repair: 'sửa chữa', service: 'phục vụ', fix: 'sửa nhỏ' };

/** Việc buồng phòng và bảo trì. Mỗi nhóm có số nhân viên cố định; việc dư xếp hàng theo thứ tự giao. */
export class TaskBoard {
  /** Chỉ các việc đang làm hoặc đang chờ; việc xong được bỏ ra. */
  readonly tasks: Task[] = [];
  private nextId = 1;

  constructor(
    private readonly rooms: readonly Room[],
    private readonly config: TaskConfig,
  ) {}

  crew(group: CrewGroup): number {
    return this.config.staff[group];
  }

  busy(group: CrewGroup): number {
    return this.tasks.filter((t) => GROUP[t.kind] === group && t.status === 'working').length;
  }

  queued(group: CrewGroup): number {
    return this.tasks.filter((t) => GROUP[t.kind] === group && t.status === 'queued').length;
  }

  taskFor(roomId: string): Task | undefined {
    return this.tasks.find((t) => t.roomId === roomId);
  }

  assign(roomId: string, kind: TaskKind): Result {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) return fail('Không tìm thấy phòng');
    if (this.taskFor(roomId)) return fail(`Phòng ${roomId} đã được giao việc`);
    if (room.status !== REQUIRES[kind]) return fail(`Phòng ${roomId} không cần ${KIND_LABEL[kind]}`);
    this.tasks.push({ id: `t${this.nextId++}`, roomId, kind, status: 'queued', minutesLeft: this.config.minutes[kind] });
    this.startWaiting(GROUP[kind]);
    return ok;
  }

  /** Trừ thời gian các việc đang làm; trả về những việc vừa xong. */
  tick(deltaMinutes: number): Task[] {
    const finished: Task[] = [];
    for (const t of [...this.tasks]) {
      if (t.status !== 'working') continue;
      t.minutesLeft -= deltaMinutes;
      if (t.minutesLeft > 0) continue;
      if (WHILE_WORKING[t.kind]) transition(this.rooms.find((r) => r.id === t.roomId)!, 'vacant_clean');
      this.tasks.splice(this.tasks.indexOf(t), 1);
      finished.push(t);
    }
    this.startWaiting('housekeeping');
    this.startWaiting('maintenance');
    return finished;
  }

  private startWaiting(group: CrewGroup): void {
    let free = this.crew(group) - this.busy(group);
    for (const t of this.tasks) {
      if (free <= 0) break;
      if (GROUP[t.kind] !== group || t.status !== 'queued') continue;
      const working = WHILE_WORKING[t.kind];
      if (working) transition(this.rooms.find((r) => r.id === t.roomId)!, working);
      t.status = 'working';
      free -= 1;
    }
  }
}
