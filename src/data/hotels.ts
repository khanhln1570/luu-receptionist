import { parseHotels } from '../core/hotels';
import khachSan from './hotels/khach-san-hoa-mai.json';
import nhaNghi from './hotels/nha-nghi-hoa-mai.json';
import resort from './hotels/resort-bien-xanh.json';

/** Thứ tự trong mảng là thứ tự hiện ở menu. Dữ liệu sai sẽ báo lỗi ngay khi tải. */
export const HOTELS = parseHotels([nhaNghi, khachSan, resort]);
