import type { Rng } from '../core/rng';
import type { Scenario } from '../core/scenarios';
import { STORIES } from './story';

const OWNER_VISIT_CHANCE = 1 / 3; // xác suất chủ khách sạn ghé quầy trong một ngày

const visit = (
  id: string,
  hotelId: string,
  lines: string[],
  options: Array<[text: string, result: string, satisfaction: number, money?: number]>,
): Scenario => ({
  id,
  type: 'special',
  guest: STORIES[hotelId]!.owner.name,
  lines,
  options: options.map(([text, result, satisfaction, money]) => ({ text, result, effects: money ? { satisfaction, money } : { satisfaction } })),
});

/** Chủ khách sạn ghé quầy: mỗi nơi 3 tình huống theo tính cách của chủ. */
export const OWNER_VISITS: Record<string, readonly Scenario[]> = {
  'nha-nghi-hoa-mai': [
    visit('chu-sau-kiem-tra', 'nha-nghi-hoa-mai', ['Cô Sáu ghé quầy, tay vẫn xách làn chợ: “Cô đi ngang, ghé coi con làm ăn sao. Phòng nào đang dơ, phòng nào còn trống, nói cô nghe coi.”'], [
      ['Dẫn cô xem bảng phòng và báo cáo đúng tình hình', 'Cô Sáu gật gù: “Thật thà vậy cô mới yên tâm.”', 8],
      ['Mời cô ngồi uống trà rồi hẵng tính', 'Cô Sáu cười, nhưng cứ liếc về phía hành lang.', 2, -20_000],
      ['Nói mọi thứ đều ổn, không có gì', 'Cô Sáu đi một vòng, thấy phòng chưa dọn và chép miệng.', -5],
    ]),
    visit('chu-sau-trai-cay', 'nha-nghi-hoa-mai', ['Cô Sáu đặt rổ trái cây từ vườn lên quầy: “Cúng rằm còn dư. Con tính sao cho khách ăn cho đẹp?”'], [
      ['Bày đĩa trái cây mời khách đang chờ', 'Khách chờ được ăn thử, ai cũng khen cô chủ chu đáo.', 9],
      ['Cất vào tủ lạnh nhân viên', 'Cô Sáu hơi tiếc: “Để chi cho héo.”', 0],
      ['Dạ quy định không nhận đồ ạ', 'Cô Sáu khựng lại: “Đồ nhà cô mà con.”', -6],
    ]),
    visit('chu-sau-tang-gia', 'nha-nghi-hoa-mai', ['Cô Sáu hỏi nhỏ: “Gạo, điện nước lên hết rồi. Cô tính tăng giá phòng, con thấy sao? Con tiếp khách mỗi ngày, con rành hơn cô.”'], [
      ['Đề nghị tăng nhẹ, giữ ưu đãi cho khách quen', 'Cô Sáu gật đầu: “Vậy hợp lý. Cô nghe con.”', 7, 60_000],
      ['Can ngăn: khách ở đây nhạy cảm chuyện giá', 'Cô Sáu thở dài: “Ừ… cô cũng sợ vậy.”', 3],
      ['Cứ tăng mạnh 20% cho dư dả', 'Mấy khách hay ghé nhăn mặt khi nghe báo giá mới.', -7, 90_000],
    ]),
  ],
  'khach-san-hoa-mai': [
    visit('chu-thinh-doi-chieu', 'khach-san-hoa-mai', ['Ông Thịnh đặt cặp hồ sơ xuống quầy: “Đối chiếu sổ đặt phòng với tình trạng phòng thực tế. Có sai lệch nào không?”'], [
      ['Đưa sổ và bảng phòng đã đối chiếu từ sáng', 'Ông Thịnh soát từng dòng, khẽ gật: “Không sai.”', 10],
      ['Xin ông cho thêm chút thời gian', 'Ông Thịnh nhìn đồng hồ: “Tôi chờ năm phút.”', -3],
      ['Giải thích hôm nay đông khách nên chưa kịp', 'Ông Thịnh chép vào sổ: “Lý do không phải kết quả.”', -8],
    ]),
    visit('chu-thinh-doi-tac', 'khach-san-hoa-mai', ['Ông Thịnh nói nhanh: “Chiều nay một đối tác lớn của tôi đến. Phòng VIP đẹp nhất, chuẩn bị đón cho tử tế.”'], [
      ['Giữ phòng VIP sạch nhất, chuẩn bị trà và khăn lạnh', 'Ông Thịnh nhướng mày hài lòng: “Đúng ý tôi.”', 9, -50_000],
      ['Ghi chú, khách đến thì xếp phòng theo thứ tự', 'Ông Thịnh nhăn mặt: “Đây là người quan trọng.”', -4],
      ['Dạ con sẽ cố gắng', 'Ông Thịnh nhìn bạn rất lâu mà không nói gì.', -8],
    ]),
    visit('chu-thinh-cat-giam', 'khach-san-hoa-mai', ['Ông Thịnh cau mày xem báo cáo: “Chi phí tháng này vượt dự toán. Bạn đề xuất cắt giảm ở đâu?”'], [
      ['Bớt đồ tặng không cần thiết, giữ chất lượng phòng', 'Ông Thịnh gạch vài dòng: “Hợp lý.”', 6, 40_000],
      ['Cắt giờ làm của buồng phòng', 'Ông Thịnh đồng ý, nhưng nhân viên bắt đầu xì xào.', -6, 80_000],
      ['Xin giữ nguyên, chất lượng là gốc của Golden Bay', 'Ông Thịnh trầm ngâm: “Cũng là một cách nhìn.”', 3],
    ]),
  ],
  'resort-bien-xanh': [
    visit('chu-ania-gop-y', 'resort-bien-xanh', ['Chị Ania đi dạo qua sảnh, mỉm cười: “Em thấy sảnh hôm nay còn thiếu gì không? Nói thật nhé.”'], [
      ['Góp ý cụ thể: thêm nước chanh sả chào khách', 'Chị Ania ghi vào điện thoại: “Hay đó, mai làm liền.”', 8],
      ['Khen mọi thứ đều hoàn hảo', 'Chị Ania cười: “Vậy thì chị không học được gì rồi.”', -2],
      ['Than thiếu người, nhiều việc quá', 'Chị Ania gật đầu, nhưng ánh mắt hơi chùng xuống.', -4],
    ]),
    visit('chu-ania-doan-som', 'resort-bien-xanh', ['Chị Ania bước nhanh ra quầy: “Một đoàn khách tới sớm hai tiếng mà phòng chưa dọn kịp. Em xử lý sao?”'], [
      ['Mời đoàn nghỉ ở sảnh với nước dừa, ưu tiên dọn phòng cho họ', 'Cả đoàn thư giãn, còn chụp ảnh sảnh đăng mạng.', 9, -60_000],
      ['Bảo đoàn chờ đến đúng giờ nhận phòng', 'Đoàn khách mệt mỏi, chị Ania đứng nhìn không nói.', -8],
      ['Xếp luôn phòng chưa dọn cho đoàn', 'Khách phát hiện ga giường chưa thay, mặt ai cũng sượng.', -12],
    ]),
    visit('chu-ania-truong-ca', 'resort-bien-xanh', ['Chị Ania ngồi xuống ghế khách: “Chị đang cân nhắc cho em làm trưởng ca. Em hình dung mình sẽ điều hành thế nào?”'], [
      ['Đề xuất lịch ca và quy trình đón khách rõ ràng', 'Chị Ania gật đầu liên tục: “Chị cần người nghĩ được vậy.”', 10],
      ['Thú thật em chưa sẵn sàng', 'Chị Ania mỉm cười: “Biết mình chưa sẵn sàng cũng là điểm cộng.”', 1],
      ['Hỏi ngay chuyện tăng lương', 'Chị Ania nhíu mày: “Để xem em làm được gì đã.”', -5],
    ]),
  ],
};

/** Hôm nay chủ khách sạn có ghé quầy không, và ghé với tình huống nào. */
export function pickOwnerVisit(hotelId: string, rng: Rng): Scenario | undefined {
  const pool = OWNER_VISITS[hotelId];
  return pool?.length && rng.chance(OWNER_VISIT_CHANCE) ? rng.pick(pool) : undefined;
}
