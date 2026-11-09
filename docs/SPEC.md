# Luu Receptionist — Spec & Kế hoạch triển khai

Game quản lý lễ tân khách sạn chạy trên trình duyệt. Người chơi đứng ở quầy, xử lý khách check-in/check-out, sự cố buồng phòng, đặt trước và overbooking.

## 1. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Vai trò | Lễ tân đứng yên ở quầy, camera cố định |
| Vòng chơi | Chơi theo ngày; có tiền, điểm, đánh giá sao; mỗi khách là một tình huống riêng |
| Nghiệp vụ | Trạng thái phòng, sự cố + đổi phòng, giao việc buồng phòng/bảo trì (có thời gian), overbooking, đặt trước, walk-in |
| Nhân vật | Portrait 2D trong khung hội thoại, **render từ model 3D nhân vật KayKit** (chỉ dùng bản miễn phí). Cảnh 3D không có nhân vật di chuyển |
| Khách sạn | Nhiều khách sạn, mỗi cái là một màn, mở khóa dần; khác số phòng, loại khách, độ khó; cấu hình bằng JSON |
| Ngôn ngữ | Tiếng Việt, ưu tiên desktop |
| Nội dung | Kịch bản JSON viết sẵn, ghép ngẫu nhiên từ các mảnh (không dùng LLM) |
| Backend | Không có |

## 2. Giả định (chưa hỏi, đổi được)

- **Lưu game**: `localStorage`, lưu khách sạn đã mở khóa, sao, tiền tích lũy. Không lưu giữa chừng một ngày chơi.
- **Âm thanh**: bản đầu không có; để chỗ gắn sau.
- **Độ khó**: điều chỉnh qua tham số trong JSON khách sạn (số khách/ngày, tỉ lệ sự cố, tỉ lệ overbooking, độ kiên nhẫn của khách).
- **Asset**: KayKit Furniture Bits / City Builder Bits (theo trí nhớ là CC0, định dạng GLB/GLTF; **cần xác nhận lại trên trang itch.io** vì tôi chưa đọc được). Portrait: render từ pack nhân vật KayKit (Adventurers, CC0, có bản free; có thể thêm Mystery Series 4/5 nếu bản free và license cho phép, **chưa xác nhận**). Ràng buộc: chỉ dùng nội dung tải miễn phí. Xem mục 6.1.

## 3. Gameplay

### 3.1 Một ngày chơi
1. **Bắt đầu ngày**: hiện tóm tắt (số phòng trống, đặt trước hôm nay, nhân viên có mặt).
2. **Giờ làm việc**: đồng hồ trong game chạy (1 giây thật = 1,1 phút game ở tốc độ 1x, có thể tạm dừng khi đang mở hội thoại). Khách lần lượt đến quầy theo lịch sinh sẵn.
3. **Kết thúc ngày**: tổng kết doanh thu, phạt, đánh giá sao, sự kiện đáng nhớ. Qua ngày kế tiếp.
4. **Hoàn thành khách sạn**: sau N ngày (cấu hình theo màn) đạt mốc sao tối thiểu thì mở khách sạn kế.

### 3.2 Các loại tình huống khách
| Loại | Mô tả | Hành động của người chơi |
|---|---|---|
| Check-in có đặt trước | Khách đọc tên/mã đặt phòng | Tìm đúng đặt chỗ, gán phòng đúng loại, đưa chìa |
| Walk-in | Không đặt trước | Hỏi nhu cầu, báo giá, gán phòng trống sạch, hoặc từ chối nếu hết |
| Check-out | Khách trả phòng | Xác nhận, thu tiền (có thể có phụ phí: minibar, hỏng đồ), đánh dấu phòng "chưa dọn" |
| Báo sự cố | Hỏng đồ, thiếu khăn, ồn, phòng bẩn | Chọn: đổi phòng / gọi bảo trì / gọi buồng phòng / giảm giá / từ chối |
| Overbooking | Hết phòng dù có đặt trước | Nâng hạng, chuyển khách sạn khác, bồi thường, hoặc xin lỗi |
| Tình huống đặc biệt | Khiếu nại, đặt nhầm tên, VIP, khách khó tính | Chọn một trong các lựa chọn, mỗi lựa chọn có hậu quả |

### 3.3 Phòng và trạng thái
Máy trạng thái của một phòng:

```
trống_sạch → có_khách → chưa_dọn → đang_dọn → trống_sạch
                  ↓
              hỏng (cần bảo trì) → đang_sửa → trống_sạch
```

- Chỉ gán được phòng `trống_sạch` và đúng loại (đơn, đôi, VIP...).
- Mỗi phòng có: loại, tầng, giá, tình trạng đồ đạc.

### 3.4 Nhân viên và công việc
- Số nhân viên buồng phòng và bảo trì có hạn (khác nhau theo khách sạn).
- Người chơi giao việc từ bảng phòng; việc mất X phút game, nhân viên bận trong lúc đó.
- Hết nhân viên thì việc xếp hàng chờ.

### 3.5 Điểm và hậu quả
- **Điểm từng khách (0–100):** phục vụ đúng 85; trừ tối đa 25 theo phần kiên nhẫn đã dùng khi chờ; trừ 8 cho mỗi lần chọn sai với khách đang ở quầy; khách tình huống = 60 + hiệu ứng lựa chọn × 2,5; miễn phụ phí +5; khách bỏ đi 10; bị từ chối 30; hết ngày chưa phục vụ 20.
- **Hài lòng** của ngày là trung bình điểm các khách.
- **Doanh thu** thu khi khách trả phòng (tiền phòng + phụ phí). Giảm giá và bồi thường trừ vào doanh thu. **Mục tiêu** của ngày = 80% tổng hóa đơn các khách sẽ trả phòng hôm đó.
- **Sao** (1–5) từ điểm tổng = 60% hài lòng + 40% điểm doanh thu (doanh thu / mục tiêu, tối đa 100); ngưỡng 40, 60, 75, 90.
- Khách hết kiên nhẫn sẽ bỏ đi, kéo điểm hài lòng xuống.

Khách check-in và walk-in được hỏi chuyện theo kịch bản ở quầy (chỉ UI, chưa có trong core): (1) "Anh/chị đã đặt phòng trước chưa ạ?" → (2) đã đặt: "Anh/chị đặt phòng nào ạ? Cho tôi xin tên hoặc mã đặt phòng" / chưa đặt: "Anh/chị cần loại phòng nào ạ?" → khách cho tên, loại phòng, mã; chỉ sau bước 2 mới giao phòng được. Tên khách chỉ hiện sau bước 2. Khách check-out và các tình huống đặc biệt giữ luồng cũ.

Bấm vào một người trong sảnh 3D hiện bong bóng thoại trên đầu với hai lựa chọn: **Hỏi thăm** (trả lời ngẫu nhiên từ `src/core/smalltalk.ts`) và **Đuổi**. Đuổi khách đang chờ nhận phòng/vãng lai tính như từ chối khách (`Game.shooWaiting`); khách ở quầy dùng `dismissCurrent`; khách đang ở khách sạn ngồi chơi ở sảnh thì về phòng, không ảnh hưởng điểm. Khách trả phòng hoặc báo sự cố không đuổi được.

## 4. Giao diện

- **Màn phố** (thay menu thẻ): `src/render/street.ts` dựng một con phố bằng City Builder Bits với ba tòa khách sạn (nhà nghỉ `building_A`, khách sạn `building_D`, resort `building_E`), biển tên trên nóc, xe chạy, mũi tên chỉ tòa đang chọn. Bấm tòa nhà (hoặc nhãn trạng thái) mở thẻ thông tin với nút "Vào làm ở đây". Mỗi lần ra phố, Lưu (avatar chính diện `assets/portraits/le-tan/mat.png`) kể chuyện mất việc và hướng dẫn qua 4 lời thoại (Tiếp / Bỏ qua / Bắt đầu thôi!), mở lại bằng "? Hướng dẫn".
- Trong sảnh có nút **Ra phố** trên thanh tốc độ; ca chưa xong thì hỏi xác nhận và bỏ ca, không tính kết quả.
- **Lễ tân** (nhân vật chính, `RECEPTIONIST` trong `src/data/looks.ts`) đứng ở đầu quầy bên trái, quay lưng về camera, xoay về phía khách đang ở quầy.

- Các món không có trong pack KayKit (tường, cửa, khung cửa, đèn lồng, đèn chùm, đèn thả, dây đèn, cây cọ, bụi cây cắt tỉa, chuông quầy, thảm chân cửa, biển hiệu, cửa sổ) dựng bằng `src/render/kit.ts` theo phong cách KayKit: cạnh bo tròn, màu mờ, lá low-poly.

- **Cảnh 3D (Three.js)**: sảnh + quầy lễ tân dựng từ Furniture Bits, camera cố định, ánh sáng đơn giản. Chủ yếu để tạo không khí; không điều khiển trực tiếp.
- **Lớp UI (HTML/CSS đè lên canvas)**:
  - Khung hội thoại: portrait khách + tên + câu thoại + các nút lựa chọn.
  - Bảng phòng: lưới phòng theo tầng, màu theo trạng thái, bấm để xem chi tiết/giao việc.
  - Sổ đặt phòng: danh sách đặt trước hôm nay, tìm kiếm theo tên/mã.
  - Thanh trạng thái: giờ trong game, tiền, hài lòng, số khách đang chờ.
  - Màn hình: menu chính, chọn khách sạn, tổng kết ngày.
- Khách chờ hiện thành hàng chờ (chip/avatar nhỏ) trên thanh trạng thái.

## 5. Dữ liệu (JSON)

### 5.1 Khách sạn `src/data/hotels/*.json`
Phòng khai báo theo **nhóm** (cùng tầng, loại, giá); số phòng tự đánh theo tầng (101, 102, ... 201, ...). Trong mỗi nhóm, các phòng đầu có khách ở sẵn (`occupied`), rồi chưa dọn (`dirty`), rồi hỏng (`broken`).
```json
{
  "id": "khach-san-hoa-mai",
  "name": "Golden Bay",
  "description": "...",
  "unlock": { "requires": "nha-nghi-hoa-mai" },
  "goal": { "days": 3, "minStars": 3 },
  "roomGroups": [
    { "floor": 1, "type": "don", "count": 8, "price": 250000, "occupied": 2, "dirty": 1 },
    { "floor": 3, "type": "vip", "count": 2, "price": 900000 }
  ],
  "staff": { "housekeeping": 2, "maintenance": 1 },
  "taskMinutes": { "cleaning": 30, "repair": 90, "service": 10, "fix": 25 },
  "difficulty": {
    "guestsPerDay": [6, 8], "patienceMinutes": 25, "walkInRate": 0.3,
    "incidentRate": 0.7, "overbookingRate": 0.1, "specialRate": 0.12
  }
}
```
- `unlock.requires`: id khách sạn phải hoàn thành trước (null = mở sẵn). Chuỗi mở khóa phải có khách sạn mở sẵn, không vòng lặp.
- `goal`: hoàn thành khi có đủ `days` **ngày đạt** (mỗi ngày đạt ít nhất `minStars` sao). Ngày kém vẫn được chơi lại.
- `taskMinutes` tùy chọn; `difficulty.*Rate` tùy chọn (mặc định 0). Khách sạn không có phòng VIP thì không có khách đòi phòng VIP.
- Dữ liệu được kiểm tra khi tải; sai thì báo lỗi kèm id khách sạn.
- Tiến trình lưu ở `localStorage` (khóa `luu-receptionist-save-v1`): số ngày đã chơi, số ngày đạt, sao và điểm tốt nhất của từng khách sạn.

### 5.2 Kịch bản tình huống `data/scenarios/*.json`
Mỗi tình huống: loại, điều kiện áp dụng, lời thoại (có biến `{ten}`, `{phong}`), các lựa chọn, hiệu ứng của từng lựa chọn.
```json
{
  "id": "khan-thieu",
  "type": "incident",
  "lines": ["Phòng {phong} thiếu khăn tắm, nhờ bạn gửi thêm."],
  "options": [
    { "text": "Gọi buồng phòng mang lên", "effects": { "task": "housekeeping", "satisfaction": +5 } },
    { "text": "Bảo khách tự xuống lấy", "effects": { "satisfaction": -10 } }
  ]
}
```

### 5.3 Khách `data/guests.json`
Tên (ghép họ + tên đệm + tên), nhóm tính cách (kiên nhẫn, khó tính, dễ tính, VIP), tag portrait.

## 6. Kiến trúc kỹ thuật

- **Stack**: Vite + TypeScript + Three.js. UI bằng DOM thuần (không framework) trừ khi thấy cần.
- **Tách logic khỏi hiển thị**: toàn bộ luật chơi là TypeScript thuần, không import Three.js hay DOM, để test được bằng Vitest.

```
src/
  core/          # logic thuần, có test
    clock.ts       # đồng hồ game
    rooms.ts       # trạng thái phòng
    reservations.ts
    tasks.ts       # công việc buồng phòng/bảo trì
    guests.ts      # sinh khách, kiên nhẫn
    scenarios.ts   # chọn + ghép tình huống
    scoring.ts     # hài lòng, sao, tiền
    game.ts        # vòng lặp ngày, điều phối
  data/          # JSON + schema/loader có kiểm tra
  render/        # Three.js: cảnh sảnh, camera, load GLB
  ui/            # DOM: hội thoại, bảng phòng, sổ đặt, HUD, menu
  save/          # localStorage
  main.ts
public/assets/   # GLB, portrait
```

- **Sinh ngày chơi có seed**: dùng PRNG có seed để tái hiện lỗi và test ổn định.
- **Kiểm tra dữ liệu**: validate JSON khi load (zod hoặc kiểm tra tay) để lỗi file nội dung báo rõ.

### 6.1 Quy trình tạo portrait

Portrait là ảnh PNG tĩnh, tạo trước (offline), không render lúc chơi.

1. Một trang công cụ riêng `tools/portrait.html` (Three.js) tải GLB nhân vật KayKit, đặt camera cận mặt/nửa người, nền trong suốt.
2. Với mỗi nhân vật và mỗi **biểu cảm/tâm thế**, xuất một PNG vào `public/assets/portraits/<nhan-vat>/<bieu-cam>.png`.
3. Vì model KayKit thường không có biểu cảm khuôn mặt, "biểu cảm" được tạo bằng:
   - pose khác nhau (chọn khung hình từ animation: đứng thường, khoanh tay, chống nạnh, giơ tay...),
   - icon cảm xúc nhỏ gắn cạnh portrait trong UI (vui, giận, lo...),
   - màu viền khung theo mức hài lòng.
4. Dữ liệu khách tham chiếu portrait bằng tag (`"portrait": "hiep-si-1"`), nên đổi ảnh không ảnh hưởng logic.

Giới hạn chấp nhận: nhân vật theo phong cách KayKit (có thể là fantasy), số lượng khách khác nhau bị giới hạn bởi số model free. Bù lại bằng cách ghép tên, câu thoại và tình huống ngẫu nhiên; có thể đổi màu áo/tóc bằng cách đổi texture hoặc tint khi render.


**Đã làm (10a):** dùng pack Adventurers 2.0 (CC0). `src/data/looks.ts` định nghĩa 8 ngoại hình khách du lịch: ẩn mũ/áo choàng/giáp/vũ khí, đổi màu da–tóc–áo–quần trên bảng màu 8×8 của model (giữ độ sáng tối), thêm mũ cói, kính râm, máy ảnh. 3 pose lấy từ animation `Rig_Medium_General` (Idle_A, Interact, Hit_B). Xem trước: `/tools/portrait.html`; xuất PNG: `npm run portraits` (cần `npm run dev` và `CHROME_PATH`). Game chọn mặt theo tên khách; pose "hỏi" khi có tình huống, "bực" khi kiên nhẫn dưới 35%. Biểu cảm khuôn mặt cố định (mặt vẽ trên texture), nên chỉ đổi được qua pose.

## 7. Kế hoạch triển khai

Mỗi mốc kết thúc bằng một thứ chạy được và kiểm chứng được.

| # | Mốc | Nội dung | Kiểm chứng |
|---|---|---|---|
| 0 | Khung dự án | Vite + TS + Three.js + Vitest, lint, cấu trúc thư mục | `npm run dev` mở trang trống; `npm test` chạy được |
| 1 | Cảnh 3D | Tải GLB Furniture Bits, dựng sảnh + quầy, camera cố định | Xem trong trình duyệt, ảnh chụp màn hình |
| 2 | Lõi: phòng + đặt trước | Máy trạng thái phòng, đặt phòng, gán phòng đúng loại | Unit test các chuyển trạng thái, gán sai bị chặn |
| 3 | Lõi: ngày + khách | Đồng hồ, sinh khách theo seed, kiên nhẫn, hàng chờ | Unit test: cùng seed ra cùng lịch khách |
| 4 | UI cốt lõi | HUD, bảng phòng, sổ đặt, khung hội thoại (portrait placeholder) | Chơi được 1 ngày với 1 loại khách (check-in) |
| 5 | Check-out + phụ phí | Thu tiền, phòng chuyển "chưa dọn" | Vòng check-in → check-out đủ |
| 6 | Công việc buồng phòng/bảo trì | Giao việc, thời gian, nhân viên có hạn | Test hàng chờ việc; chơi thử |
| 7 | Sự cố + overbooking + tình huống đặc biệt | Engine kịch bản, hiệu ứng lựa chọn, biến thế | Test engine kịch bản; viết ~15 tình huống đầu |
| 8 | Điểm + tổng kết ngày + sao | Công thức hài lòng/sao, màn tổng kết | Test công thức; chơi hết một ngày |
| 9 | Nhiều khách sạn + mở khóa + lưu | Menu chọn KS, 3 KS mẫu (nhỏ/vừa/lớn), `localStorage` | Chơi qua KS 1 mở KS 2; tải lại vẫn giữ tiến trình |
| 10a | Công cụ render portrait | `tools/portrait.html`: tải GLB nhân vật KayKit, chụp cận cảnh, xuất PNG nền trong suốt | Xuất được portrait cho ít nhất 3 nhân vật, mỗi người 3 pose; thay placeholder trong game |
| 10b | Nội dung | Mở rộng lên ~30–60 tình huống, thêm nhân vật/pose | Playtest, chỉnh cân bằng |
| 11 | Đóng gói | Build tĩnh, đưa lên itch.io hoặc GitHub Pages | Chạy bản build trên trình duyệt sạch |

**Thứ tự ưu tiên khi hết sức:** mốc 0–6, 8, 9 là xương sống. Mốc 7 và 10a/10b có thể mở rộng dần. Mốc 10a có thể làm sớm hơn (ngay sau mốc 1) vì dùng chung cách tải GLB.

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Phạm vi nghiệp vụ lớn (4 mảng: trạng thái, sự cố, giao việc, overbooking) | Làm lõi theo thứ tự mốc; mỗi mảng độc lập, có test |
| Cân bằng độ khó khó đoán | Mọi tham số nằm trong JSON; có chế độ chạy mô phỏng nhanh bằng seed để thử |
| Nội dung tình huống tốn công viết | Ghép từ mảnh (tên, phòng, lời mở đầu, lựa chọn) để nhân số biến thể |
| Asset không đủ đồ cho sảnh/phòng | Kiểm tra danh mục model ngay ở mốc 1 |
| Nhân vật KayKit có thể là fantasy, ít biểu cảm, ít mẫu | Xem ảnh thật ở mốc 10a trước khi viết nhiều nội dung; dùng pose + icon cảm xúc + tint màu để tăng độ đa dạng; chấp nhận phong cách hài hước nếu cần |
| License và nội dung bản free của các pack nhân vật | Xác nhận trên trang itch.io trước khi dùng; chỉ dùng phần tải miễn phí |

## 9. Câu hỏi còn mở

1. ~~Portrait lấy ở đâu?~~ **Đã chốt**: render từ model KayKit, chỉ dùng bản miễn phí (mục 6.1). Còn mở: dùng pack nào (Adventurers và/hoặc Mystery Series 4/5) sau khi xem ảnh thật.
2. **License và bản free của các pack**: cần xác nhận trên trang itch.io cho Furniture Bits, City Builder Bits và các pack nhân vật (CC0 hay không, bản free có đủ model không).
3. **Âm thanh** có làm không, và khi nào.
4. **Tên game** chính thức (repo đang là `luu-receptionist`).
