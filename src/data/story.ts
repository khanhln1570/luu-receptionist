import type { HotelStory } from '../core/story';

/** Cốt truyện từng khách sạn, theo id. Chủ khách sạn kể thêm sau mỗi ngày làm việc. */
export const STORIES: Record<string, HotelStory> = {
  'nha-nghi-hoa-mai': {
    owner: { name: 'Cô Sáu', title: 'chủ homestay' },
    chapters: [
      { when: 0, title: 'Chương 1 — Ngày đầu ở homestay', lines: ['Cô Sáu chống nạnh nhìn sảnh: “Homestay này cô dựng từ tiền dành dụm cả đời. Con thử việc ba bữa, làm được thì cô giữ.”', 'Cô nháy mắt: “Khách nào cũng như người nhà, nhớ nghen.”'] },
      { when: 1, title: 'Chương 2 — Mấy ông bà khách quen', lines: ['Cô Sáu thì thầm: “Chú Tám với cô Hạnh ở đầu ngõ hay ghé lắm. Ai tử tế với họ, họ nhớ cả đời.”', 'Cô cười: “Có khi con sẽ thấy họ trở lại nhiều lần đó.”'] },
      { when: 2, title: 'Chương 3 — Được nhận chính thức', lines: ['Cô Sáu rưng rưng đưa chìa khóa tủ két: “Từ nay con là người nhà của homestay Raon.”', 'Phố bên kia đang có chỗ tuyển lễ tân mới, sang xem thử đi con.'] },
    ],
    daily: {
      low: ['Cô Sáu thở dài: “Hôm nay khách phàn nàn nhiều, mai cố lên con.”', 'Cô xoa vai Lưu: “Ngày xấu rồi cũng qua, đừng nản.”'],
      mid: ['Cô Sáu gật gù: “Cũng được, nhưng cô tin con làm tốt hơn nữa.”', 'Cô đưa Lưu ly trà đá: “Nghỉ chút đi con.”'],
      high: ['Cô Sáu cười tít mắt: “Khách khen con quá trời, cô nở mũi luôn.”', 'Cô khoe với hàng xóm: “Lễ tân nhà tôi đó!”'],
    },
  },
  'khach-san-hoa-mai': {
    owner: { name: 'Ông Thịnh', title: 'giám đốc Golden Bay' },
    chapters: [
      { when: 0, title: 'Chương 1 — Giám đốc khó tính', lines: ['Ông Thịnh đẩy gọng kính: “Golden Bay có tiếng ba mươi năm. Tôi không cần lễ tân giỏi, tôi cần lễ tân không sai sót.”', 'Ông gõ ngón tay lên quầy: “Ba ngày. Làm tôi bất ngờ đi.”'] },
      { when: 1, title: 'Chương 2 — Một vị khách đáng ngờ', lines: ['Ông Thịnh hạ giọng: “Có tin đối thủ cử người vào sảnh dò xét, và nhà phê bình đang đi qua các khách sạn trong vùng.”', 'Ông nhìn bạn: “Cẩn thận ai bạn mời nước, ai bạn mời đi.”'] },
      { when: 2, title: 'Chương 3 — Lời khen đầu tiên', lines: ['Ông Thịnh ho khẽ: “Tôi vừa nghe khách khen lễ tân của tôi. Không hiểu sao… tôi thấy vui.”'] },
      { when: 3, title: 'Chương 4 — Chiếc huy hiệu vàng', lines: ['Ông Thịnh cài lên áo Lưu một chiếc huy hiệu vàng: “Chúc mừng, bạn là lễ tân của Golden Bay.”', 'Ông cười hiếm hoi: “Ở resort phía cuối phố, họ cũng đang cần người như bạn.”'] },
    ],
    daily: {
      low: ['Ông Thịnh lắc đầu: “Hôm nay tệ. Golden Bay không có chỗ cho ngày tệ.”', 'Ông cầm báo cáo, cau mày không nói thêm.'],
      mid: ['Ông Thịnh ghi vào sổ: “Đạt yêu cầu. Chỉ đạt thôi.”', 'Ông gật nhẹ: “Tạm được.”'],
      high: ['Ông Thịnh bất ngờ mỉm cười: “Hôm nay khách hài lòng thật.”', 'Ông thưởng cho Lưu một ly cà phê nóng của khách sạn.'],
    },
  },
  'resort-bien-xanh': {
    owner: { name: 'Chị Ania', title: 'quản lý ANIA Resort' },
    chapters: [
      { when: 0, title: 'Chương 1 — Resort bên bờ biển', lines: ['Chị Ania dang tay đón gió: “Chào mừng tới ANIA! Ở đây khách đến để thư giãn, còn mình thì làm mọi thứ trông thật dễ dàng.”', 'Chị nháy mắt: “Nhớ giữ nụ cười nhé.”'] },
      { when: 1, title: 'Chương 2 — Những vị khách từ xa', lines: ['Chị Ania kể: “Có ông khách Nhật mê chợ đêm và một bà blogger kén ăn. Ai cũng mang theo câu chuyện riêng.”', 'Chị mỉm cười: “Lắng nghe họ, đó là bí quyết của ANIA.”'] },
      { when: 2, title: 'Chương 3 — Mùa cao điểm sắp tới', lines: ['Chị Ania chỉ ra biển: “Mùa cao điểm sắp tới, khách sẽ đông gấp đôi. Lưu thấy sẵn sàng chưa?”'] },
      { when: 3, title: 'Chương 4 — Gia đình ANIA', lines: ['Chị Ania ôm Lưu: “Từ hôm nay bạn là người của ANIA. Một lễ tân từng thất nghiệp, giờ làm được cả ba nơi.”', 'Hoàng hôn xuống, chị rót hai ly nước dừa: “Cảm ơn bạn đã ở lại.”'] },
    ],
    daily: {
      low: ['Chị Ania nhẹ giọng: “Biển cũng có ngày động, mai sẽ êm hơn.”', 'Chị đưa Lưu một chiếc khăn lạnh: “Hít thở nào.”'],
      mid: ['Chị Ania gật đầu: “Ổn rồi. Thêm chút tinh tế nữa là tuyệt.”', 'Chị cười: “Khách hôm nay không phàn nàn, tốt rồi.”'],
      high: ['Chị Ania vỗ tay: “Tuyệt vời! Khách để lại cả đống lời khen.”', 'Chị đặt một đóa hoa lên quầy: “Cho người giữ nụ cười của ANIA.”'],
    },
  },
};
