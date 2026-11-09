import type { HotelConfig } from './game';

export type UpgradeId = 'sofa' | 'wifi' | 'housekeeper' | 'maintenance' | 'renovate';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  price: number; // đồng
}

/** Nâng cấp mua bằng tiền tích lũy, theo từng khách sạn; mỗi món mua một lần. */
export const UPGRADES: readonly Upgrade[] = [
  { id: 'sofa', name: 'Sofa nhung mới', description: 'Khách chờ kiên nhẫn hơn 15%. Gối nhung hiện ra ở sảnh.', price: 600_000 },
  { id: 'wifi', name: 'Wifi tốc độ cao', description: 'Ít khách báo sự cố hơn 25%. Bộ phát wifi đặt trên quầy.', price: 800_000 },
  { id: 'renovate', name: 'Sơn sửa sảnh và phòng', description: 'Phòng hỏng được sửa hẳn, đầu mỗi ngày đều sẵn sàng. Thêm chậu cây ở sảnh.', price: 1_000_000 },
  { id: 'housekeeper', name: 'Thuê thêm buồng phòng', description: 'Thêm một nhân viên buồng phòng. Xe dọn phòng đậu ở sảnh.', price: 1_500_000 },
  { id: 'maintenance', name: 'Thuê thêm thợ bảo trì', description: 'Thêm một nhân viên bảo trì. Hộp đồ nghề đặt ở sảnh.', price: 1_500_000 },
];

export const upgradeById = (id: string): Upgrade | undefined => UPGRADES.find((u) => u.id === id);

/** Áp các nâng cấp đã mua vào cấu hình khách sạn của ngày; không sửa cấu hình gốc. */
export function applyUpgrades(config: HotelConfig, owned: readonly string[]): HotelConfig {
  const has = (id: UpgradeId) => owned.includes(id);
  const params = { ...config.params };
  if (has('sofa')) params.patienceMinutes = Math.round(params.patienceMinutes * 1.15);
  if (has('wifi') && params.incidentRate) params.incidentRate = params.incidentRate * 0.75;
  return {
    ...config,
    params,
    staff: {
      housekeeping: config.staff.housekeeping + (has('housekeeper') ? 1 : 0),
      maintenance: config.staff.maintenance + (has('maintenance') ? 1 : 0),
    },
    rooms: has('renovate') ? config.rooms.map((r) => (r.status === 'broken' ? { ...r, status: 'vacant_clean' as const } : r)) : config.rooms,
  };
}
