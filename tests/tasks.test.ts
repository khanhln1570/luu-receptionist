import { describe, expect, it } from 'vitest';
import { Game, type HotelConfig } from '../src/core/game';
import type { Room, RoomStatus } from '../src/core/rooms';
import { TaskBoard, type TaskConfig } from '../src/core/tasks';
import { SAMPLE_HOTEL } from './fixtures/sampleHotel';

const room = (id: string, status: RoomStatus): Room => ({ id, floor: 1, type: 'don', price: 100, status });
const cfg = (housekeeping: number, maintenance: number): TaskConfig => ({
  staff: { housekeeping, maintenance },
  minutes: { cleaning: 30, repair: 90, service: 10, fix: 25 },
});

describe('TaskBoard', () => {
  it('giao dọn phòng: phòng sang đang dọn, đủ thời gian thì trống, sạch', () => {
    const rooms = [room('1', 'dirty')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    expect(board.assign('1', 'cleaning')).toEqual({ ok: true });
    expect(rooms[0]!.status).toBe('cleaning');
    expect(board.tick(29)).toEqual([]);
    expect(rooms[0]!.status).toBe('cleaning');
    const done = board.tick(1);
    expect(done.map((t) => t.roomId)).toEqual(['1']);
    expect(rooms[0]!.status).toBe('vacant_clean');
    expect(board.tasks).toEqual([]);
  });

  it('giao sửa chữa cho phòng hỏng mất nhiều thời gian hơn', () => {
    const rooms = [room('1', 'broken')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    board.assign('1', 'repair');
    expect(rooms[0]!.status).toBe('repairing');
    board.tick(89);
    expect(rooms[0]!.status).toBe('repairing');
    board.tick(1);
    expect(rooms[0]!.status).toBe('vacant_clean');
  });

  it('chặn giao sai loại việc, phòng không tồn tại, hoặc giao hai lần', () => {
    const rooms = [room('1', 'dirty'), room('2', 'broken'), room('3', 'vacant_clean')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    expect(board.assign('1', 'repair').ok).toBe(false);
    expect(board.assign('2', 'cleaning').ok).toBe(false);
    expect(board.assign('3', 'cleaning').ok).toBe(false);
    expect(board.assign('9', 'cleaning').ok).toBe(false);
    expect(board.assign('1', 'cleaning').ok).toBe(true);
    expect(board.assign('1', 'cleaning').ok).toBe(false);
    expect(rooms.map((r) => r.status)).toEqual(['cleaning', 'broken', 'vacant_clean']);
  });

  it('nhân viên có hạn: việc dư xếp hàng, phòng vẫn chưa dọn cho tới khi có người', () => {
    const rooms = [room('1', 'dirty'), room('2', 'dirty'), room('3', 'dirty')];
    const board = new TaskBoard(rooms, cfg(2, 1));
    board.assign('1', 'cleaning');
    board.assign('2', 'cleaning');
    board.assign('3', 'cleaning');
    expect(rooms.map((r) => r.status)).toEqual(['cleaning', 'cleaning', 'dirty']);
    expect(board.busy('housekeeping')).toBe(2);
    expect(board.queued('housekeeping')).toBe(1);
    board.tick(30); // hai phòng đầu xong, người rảnh nhận phòng 3
    expect(rooms.map((r) => r.status)).toEqual(['vacant_clean', 'vacant_clean', 'cleaning']);
    expect(board.queued('housekeeping')).toBe(0);
    board.tick(30);
    expect(rooms[2]!.status).toBe('vacant_clean');
  });

  it('buồng phòng và bảo trì là hai nhóm độc lập', () => {
    const rooms = [room('1', 'dirty'), room('2', 'broken')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    board.assign('1', 'cleaning');
    board.assign('2', 'repair');
    expect(board.busy('housekeeping')).toBe(1);
    expect(board.busy('maintenance')).toBe(1);
    // không có nhân viên bảo trì thì việc sửa chỉ xếp hàng
    const r2 = [room('1', 'broken')];
    const b2 = new TaskBoard(r2, cfg(1, 0));
    b2.assign('1', 'repair');
    b2.tick(1000);
    expect(r2[0]!.status).toBe('broken');
    expect(b2.queued('maintenance')).toBe(1);
  });
});

describe('Game: vòng trả phòng -> dọn -> nhận khách mới', () => {
  const config: HotelConfig = {
    ...SAMPLE_HOTEL,
    params: { ...SAMPLE_HOTEL.params, guestsPerDay: [0, 0], patienceMinutes: 600 },
  };

  it('phòng vừa trả được giao dọn rồi dùng lại được; tick báo việc vừa xong', () => {
    const game = new Game(config, 5);
    while (game.queue.waiting.length === 0) game.tick(1);
    const guest = game.callNext()!;
    const res = game.reservations.find((r) => r.code === guest.arrival.reservationCode)!;
    const target = game.rooms.find((r) => r.id === res.roomId)!;
    game.startCheckOut(res.id, target.id);
    game.settleBill(false);
    expect(target.status).toBe('dirty');

    expect(game.assignTask(target.id, 'cleaning')).toEqual({ ok: true });
    expect(target.status).toBe('cleaning');
    const result = game.tick(30);
    expect(result.finished.map((t) => t.roomId)).toEqual([target.id]);
    expect(target.status).toBe('vacant_clean');
  });

  it('phòng hỏng sẵn có thể sửa xong và dùng lại', () => {
    const game = new Game(config, 5);
    expect(game.assignTask('202', 'repair').ok).toBe(true);
    game.tick(90);
    expect(game.rooms.find((r) => r.id === '202')!.status).toBe('vacant_clean');
  });
});

describe('TaskBoard: việc tại phòng có khách', () => {
  it('phục vụ tại phòng: phòng vẫn có khách, tốn nhân viên buồng phòng, xong thì bỏ ra', () => {
    const rooms = [room('1', 'occupied')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    expect(board.assign('1', 'service')).toEqual({ ok: true });
    expect(rooms[0]!.status).toBe('occupied');
    expect(board.busy('housekeeping')).toBe(1);
    expect(board.tick(9)).toEqual([]);
    expect(board.tick(1).map((t) => t.kind)).toEqual(['service']);
    expect(rooms[0]!.status).toBe('occupied');
    expect(board.tasks).toEqual([]);
  });

  it('sửa nhỏ dùng nhân viên bảo trì; chỉ giao được cho phòng đang có khách', () => {
    const rooms = [room('1', 'occupied'), room('2', 'vacant_clean')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    expect(board.assign('2', 'service').ok).toBe(false);
    expect(board.assign('2', 'fix').ok).toBe(false);
    board.assign('1', 'fix');
    expect(board.busy('maintenance')).toBe(1);
    expect(board.busy('housekeeping')).toBe(0);
  });

  it('việc phục vụ và dọn phòng chia chung một nhóm nhân viên', () => {
    const rooms = [room('1', 'occupied'), room('2', 'dirty')];
    const board = new TaskBoard(rooms, cfg(1, 1));
    board.assign('1', 'service');
    board.assign('2', 'cleaning');
    expect(rooms[1]!.status).toBe('dirty'); // chờ vì người duy nhất đang bận
    expect(board.queued('housekeeping')).toBe(1);
    board.tick(10);
    expect(rooms[1]!.status).toBe('cleaning');
  });
});
