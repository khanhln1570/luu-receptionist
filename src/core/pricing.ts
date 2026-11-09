import type { Room, RoomType } from './rooms';
import type { TaskKind } from './tasks';

/** Việc có thu phí dịch vụ: dọn phòng và sửa chữa. Phí trừ vào doanh thu trong ngày. */
export type PaidKind = Extract<TaskKind, 'cleaning' | 'repair'>;

export const SERVICE_PRICE: Record<PaidKind, Record<RoomType, number>> = {
  cleaning: { don: 30_000, doi: 40_000, vip: 60_000 },
  repair: { don: 150_000, doi: 200_000, vip: 300_000 },
};

export const PAID_LABEL: Record<PaidKind, string> = { cleaning: 'Dọn phòng', repair: 'Sửa chữa' };

export const isPaid = (kind: TaskKind): kind is PaidKind => kind === 'cleaning' || kind === 'repair';

export const servicePrice = (room: Pick<Room, 'type'>, kind: PaidKind): number => SERVICE_PRICE[kind][room.type];

/** Phòng chưa dọn thì cần dọn, phòng hỏng thì cần sửa; trạng thái khác không cần dịch vụ. */
export const serviceFor = (status: Room['status']): PaidKind | null => (status === 'dirty' ? 'cleaning' : status === 'broken' ? 'repair' : null);
