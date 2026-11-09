import type { RoomStatus, RoomType } from './rooms';

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  don: 'phòng đơn',
  doi: 'phòng đôi',
  vip: 'phòng VIP',
};

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  vacant_clean: 'Trống, sạch',
  occupied: 'Có khách',
  dirty: 'Chưa dọn',
  cleaning: 'Đang dọn',
  broken: 'Hỏng',
  repairing: 'Đang sửa',
};
