import type { Regular } from '../core/regulars';
import type { Scenario } from '../core/scenarios';

/** Một lần ghé: lời thoại và các lựa chọn (thân thiện, rộng tay, lạnh nhạt). */
const visit = (
  id: string,
  lines: string[],
  options: Array<[text: string, result: string, satisfaction: number, money?: number]>,
): Scenario => ({
  id,
  type: 'special',
  lines,
  options: options.map(([text, result, satisfaction, money]) => ({ text, result, effects: money ? { satisfaction, money } : { satisfaction } })),
});

export const REGULARS: readonly Regular[] = [
  {
    id: 'chu-tam',
    name: 'Chú Tám',
    hotelId: 'nha-nghi-hoa-mai',
    personality: 'kho_tinh',
    roomType: 'don',
    farewell: 'Chú Tám gửi lại tấm ảnh cũ của homestay: “Chỗ này giờ có hồn rồi.”',
    visits: [
      visit('rg-chu-tam-1', ['“Chào cô cậu. Chú Tám đây, ở đây từ hồi homestay còn bán cà phê vỉa hè.”', 'Chú than mạng chập chờn rồi hỏi có thể bớt giá phòng không.'], [
        ['Mời chú ly trà đá, nghe chú kể chuyện', 'Chú Tám cười móm mém, kể một hơi nửa tiếng.', 6, -20_000],
        ['Giảm 10% tiền phòng cho chú', 'Chú gật gù: “Biết điều đó nha.”', 4, -30_000],
        ['Dạ giá niêm yết rồi chú ạ', 'Chú Tám lắc đầu: “Hồi xưa đâu có vậy.”', -6],
      ]),
      visit('rg-chu-tam-2', ['Chú Tám quay lại, xách theo túi xoài: “Tặng cô cậu.”', '“Mà hôm trước chú để quên cái nón lá ở phòng, có thấy không?”'], [
        ['Lục tủ đồ thất lạc tìm giúp chú', 'Tìm ra cái nón! Chú Tám đội lên, vui như Tết.', 8],
        ['Dạ chưa thấy, có thì con báo chú', 'Chú Tám thở dài nhưng vẫn để lại túi xoài.', -2],
        ['Chú nhớ giữ đồ giùm con nha', 'Chú Tám lườm: “Đồ trẻ con.”', -8],
      ]),
      visit('rg-chu-tam-3', ['Chú Tám mặc áo sơ mi mới: “Chú sắp dọn về quê, ghé chào cô cậu.”'], [
        ['Tặng chú một bữa sáng chia tay', 'Chú Tám rơm rớm: “Ở đây như nhà vậy.”', 10, -50_000],
        ['Chúc chú về quê vui vẻ', 'Chú Tám vẫy tay, hẹn mùa xoài sau.', 5],
        ['Dạ chú thanh toán giúp con', 'Chú Tám móc ví, không nói thêm câu nào.', -4],
      ]),
    ],
  },
  {
    id: 'co-hanh',
    name: 'Cô Hạnh',
    hotelId: 'nha-nghi-hoa-mai',
    personality: 'de_tinh',
    roomType: 'don',
    farewell: 'Cô Hạnh mở sạp rau ngay đầu ngõ và hôm nào cũng gửi sang một bó.',
    visits: [
      visit('rg-co-hanh-1', ['Cô Hạnh gánh rau vào xin nghỉ chân: “Cho cô ngồi nhờ sảnh chút, nắng quá.”'], [
        ['Mời cô ngồi quạt và rót nước', 'Cô Hạnh xúc động: “Ít ai tử tế vậy.”', 6, -20_000],
        ['Cho cô ngồi, nhưng nhờ cô để gánh ngoài cửa', 'Cô Hạnh hơi ngượng nhưng vẫn cảm ơn.', 1],
        ['Dạ sảnh dành cho khách ở thôi cô', 'Cô Hạnh lặng lẽ quảy gánh đi.', -8],
      ]),
      visit('rg-co-hanh-2', ['Cô Hạnh nhờ: “Điện thoại cô hết pin, cho cô sạc nhờ rồi gọi xe giùm cô với.”'], [
        ['Sạc điện thoại và gọi xe luôn cho cô', 'Cô Hạnh dúi vào tay bạn mớ rau muống.', 7],
        ['Cho cô mượn sạc, cô tự gọi', 'Cô Hạnh nói cảm ơn rồi loay hoay mãi.', 1],
        ['Dạ khách sạn không cho sạc nhờ ạ', 'Cô Hạnh bước ra, mắt nhìn đồng hồ sốt ruột.', -7],
      ]),
      visit('rg-co-hanh-3', ['Cô Hạnh ghé mang theo hộp bánh: “Cô mở được sạp rau rồi, nhờ lần trước tụi con giúp.”'], [
        ['Mừng cô! Mời cô ăn bánh cùng cả quầy', 'Cả sảnh cười vang, khách chờ cũng được chia bánh.', 10],
        ['Cảm ơn cô, con nhận bánh ạ', 'Cô Hạnh hài lòng ra về.', 5],
        ['Dạ cô cứ để đó giùm con', 'Cô Hạnh hơi chạnh lòng.', -3],
      ]),
    ],
  },
  {
    id: 'anh-quan',
    name: 'Anh Quân',
    hotelId: 'khach-san-hoa-mai',
    personality: 'kho_tinh',
    roomType: 'doi',
    farewell: 'Anh Quân đưa danh thiếp: “Công ty tôi sẽ đặt phòng chỗ bạn cả năm.”',
    visits: [
      visit('rg-anh-quan-1', ['Anh Quân vừa bước ra khỏi cuộc họp online: “Xuất hóa đơn VAT giúp tôi, gấp. Mười phút nữa tôi ra sân bay.”'], [
        ['Làm hóa đơn ngay, mời anh ngồi chờ', 'Anh Quân gật: “Nhanh vậy mới là dịch vụ.”', 7],
        ['Giảm phí giữ hành lý để anh kịp chuyến bay', 'Anh Quân kịp giờ, để lại lời khen.', 5, -40_000],
        ['Dạ hóa đơn xuất theo thứ tự anh ạ', 'Anh Quân thở ra: “Nhớ mặt nhau.”', -8],
      ]),
      visit('rg-anh-quan-2', ['Anh Quân quay lại: “Hôm trước phòng tôi ồn. Lần này xếp phòng yên tĩnh giùm, tôi có buổi phỏng vấn sáng sớm.”'], [
        ['Ghi chú phòng yên tĩnh cuối hành lang cho anh', 'Anh Quân ngủ ngon, sáng hôm sau nhắn lời cảm ơn.', 8],
        ['Hứa sẽ cố gắng', 'Anh Quân nhướng mày: “Cố gắng thôi à?”', -2],
        ['Phòng nào cũng như nhau thôi anh', 'Anh Quân chép miệng: “Thái độ đó khó giữ khách.”', -9],
      ]),
      visit('rg-anh-quan-3', ['Anh Quân đưa theo hai đối tác: “Hôm nay tôi mời họ ở đây, đừng làm tôi mất mặt.”'], [
        ['Chào khách bằng cà phê và khăn lạnh', 'Hai đối tác khen nức nở, Anh Quân mỉm cười hài lòng.', 10, -60_000],
        ['Làm thủ tục thật gọn cho cả đoàn', 'Mọi thứ trơn tru, Anh Quân gật đầu.', 5],
        ['Mời các anh xếp hàng như mọi khách', 'Anh Quân siết cằm, đoàn khách chờ mất cả buổi.', -9],
      ]),
    ],
  },
  {
    id: 'mai-long',
    name: 'Chị Mai & anh Long',
    hotelId: 'khach-san-hoa-mai',
    personality: 'de_tinh',
    roomType: 'doi',
    farewell: 'Mai và Long dán tấm ảnh cưới bên quầy lễ tân: “Mỗi dịp kỷ niệm tụi mình sẽ về đây.”',
    visits: [
      visit('rg-mai-long-1', ['Cặp đôi nắm tay: “Tụi mình mới cưới, đây là chuyến trăng mật. Có thể trang trí phòng giùm không?”'], [
        ['Rải cánh hoa hồng và tặng chai vang', 'Cả hai cười rạng rỡ, chụp ảnh cùng bạn.', 8, -120_000],
        ['Gửi lời chúc và một đĩa trái cây', 'Cặp đôi cảm ơn rối rít.', 5, -30_000],
        ['Dạ trang trí phòng tính phí riêng', 'Cặp đôi hơi hụt hẫng.', -4],
      ]),
      visit('rg-mai-long-2', ['Mai và Long quay lại đúng một năm sau: “Kỷ niệm một năm cưới. Còn nhớ tụi mình không?”'], [
        ['Nhớ chứ! Phòng tuần trăng mật vẫn chờ hai người', 'Mai bật khóc vì xúc động.', 9],
        ['Chúc mừng hai người, mời vào làm thủ tục', 'Họ vui vẻ nhận chìa khóa.', 4],
        ['Dạ… anh chị đã ở đây rồi sao?', 'Long gãi đầu, hơi buồn.', -5],
      ]),
      visit('rg-mai-long-3', ['Hai người ẵm theo một em bé: “Con tụi mình mới ba tháng, nhưng nhất định phải về đây.”'], [
        ['Chuẩn bị nôi em bé và phòng yên tĩnh', 'Mai ôm chầm lấy bạn: “Hai vợ chồng tin chỗ này.”', 10, -80_000],
        ['Xin chúc mừng gia đình nhỏ', 'Cả nhà cười rạng rỡ.', 5],
        ['Dạ trẻ em tính thêm phụ phí', 'Long nhíu mày nhưng đồng ý.', -5],
      ]),
    ],
  },
  {
    id: 'ba-lan',
    name: 'Bà Lan',
    hotelId: 'resort-bien-xanh',
    personality: 'vip',
    roomType: 'vip',
    farewell: 'Bà Lan đăng bài blog “Ba ngày ở ANIA” kèm lời khen riêng cho quầy lễ tân.',
    visits: [
      visit('rg-ba-lan-1', ['Bà Lan nâng máy ảnh: “Tôi là blogger du lịch. Cho tôi chụp sảnh được chứ?”'], [
        ['Mời bà chụp thoải mái, tôi dẫn bà đi xem góc đẹp nhất', 'Bà Lan hài lòng, chụp cả buổi sáng.', 7],
        ['Dạ được, nhưng xin đừng chụp khách khác', 'Bà Lan gật đầu, hơi cụt hứng.', 1],
        ['Dạ không được chụp ở sảnh ạ', 'Bà Lan cất máy, lạnh lùng.', -9],
      ]),
      visit('rg-ba-lan-2', ['Bà Lan nhẹ nhàng: “Hôm qua đồ ăn sáng hơi nguội. Tôi không phàn nàn, chỉ góp ý.”'], [
        ['Cảm ơn bà, con báo bếp và mời bà bữa sáng mới', 'Bà Lan gật gù, ghi chú lại.', 8, -50_000],
        ['Dạ con sẽ chuyển góp ý của bà', 'Bà Lan gật đầu, không nói thêm.', 2],
        ['Chắc do bà ăn trễ giờ ạ', 'Bà Lan cau mày, ghi vào sổ tay.', -10],
      ]),
      visit('rg-ba-lan-3', ['Bà Lan mỉm cười: “Tôi sắp viết bài tổng kết chuyến đi. Có gì muốn tôi nhắc tới không?”'], [
        ['Dạ, đội ngũ bên con luôn cố gắng hết mình', 'Bà Lan bật cười, đã có sẵn ý tưởng cho bài viết.', 9],
        ['Dạ bà viết gì con cũng cảm ơn', 'Bà Lan gật nhẹ.', 3],
        ['Dạ tốt nhất là bà đừng viết gì ạ', 'Bà Lan ngạc nhiên rồi nghiêm mặt.', -8],
      ]),
    ],
  },
  {
    id: 'ong-kenji',
    name: 'Ông Kenji',
    hotelId: 'resort-bien-xanh',
    personality: 'kien_nhan',
    roomType: 'doi',
    farewell: 'Ông Kenji gửi từ Nhật một hộp trà: “Cho người tiếp tôi tử tế nhất.”',
    visits: [
      visit('rg-ong-kenji-1', ['Ông Kenji cúi chào thật sâu, hỏi bằng tiếng Việt chậm rãi: “Xin lỗi… chợ đêm đi hướng nào?”'], [
        ['Vẽ bản đồ nhỏ và dặn ông cách đi', 'Ông Kenji cúi chào ba lần, cười mãi.', 6],
        ['Chỉ ông hướng đi chợ đêm', 'Ông Kenji cảm ơn, đi theo hướng bạn chỉ.', 3],
        ['Dạ ông tự tra bản đồ giùm con', 'Ông Kenji ngập ngừng, im lặng rời đi.', -5],
      ]),
      visit('rg-ong-kenji-2', ['Ông Kenji đưa bạn một túi quà nhỏ: “Tôi mua ở chợ đêm. Cảm ơn cô cậu hôm trước.”'], [
        ['Nhận quà bằng hai tay và cúi chào lại', 'Ông Kenji rất vui vì được hiểu lễ nghi.', 8],
        ['Cảm ơn ông, nhưng chúng tôi không nhận quà ạ', 'Ông Kenji hơi buồn nhưng vẫn lịch sự.', -3],
        ['Nhận nhanh rồi gọi khách kế tiếp', 'Ông Kenji gật đầu, hơi sượng.', -6],
      ]),
      visit('rg-ong-kenji-3', ['Ông Kenji ghé lần cuối: “Ngày mai tôi bay về Nhật. Chỗ này như nhà thứ hai của tôi.”'], [
        ['Tặng ông một ly trà tiễn và chúc ông bình an', 'Ông Kenji cúi chào sâu, mắt đỏ hoe.', 10, -40_000],
        ['Chúc ông thượng lộ bình an', 'Ông Kenji cúi chào, mỉm cười.', 5],
        ['Dạ ông trả phòng lúc mấy giờ ạ?', 'Ông Kenji gật, hơi hụt hẫng.', -4],
      ]),
    ],
  },
];
