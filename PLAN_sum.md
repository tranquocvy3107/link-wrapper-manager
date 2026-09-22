# Link Wrapper Manager — Bản tóm tắt để review

> Bản đầy đủ cho lập trình viên: [PLAN.md](PLAN.md) · Mô tả gốc: [link_wrapper_manager.md](link_wrapper_manager.md)
> Viết ngày 2026-09-22

---

## 1. Hệ thống này làm gì

Bình thường bạn gửi email kèm link dẫn thẳng tới trang dự án. Làm vậy thì bạn **không biết ai đã bấm**.

Hệ thống này chen một trang trung gian vào giữa. Thay vì gửi link tới thẳng trang đích, bạn gửi link của hệ thống. Người nhận bấm vào, thấy một trang chờ vài giây rồi tự động sang trang đích. Trong vài giây đó, hệ thống ghi lại lượt truy cập.

Kết quả: bạn biết link nào được bấm bao nhiêu lần, lúc nào — mà người nhận vẫn tới đúng nơi cần tới.

---

## 2. Câu chuyện của một cái link

**Bước 1 — Agent tạo link.**
Agent gửi cho hệ thống: địa chỉ trang đích, tiêu đề, mô tả ngắn, và muốn chờ bao nhiêu giây. Hệ thống lưu lại rồi trả về một địa chỉ mới, đại loại:

```
https://<địa-chỉ-của-bạn>/r/project-a?utm_source=email&...
```

**Bước 2 — Gắn vào email.**
Agent nhét địa chỉ đó vào email và gửi đi.

**Bước 3 — Người nhận bấm.**
Trang chờ hiện ra, đếm ngược, rồi tự chuyển sang trang đích. Hệ thống ghi một dòng vào sổ.

---

## 3. Người nhận nhìn thấy gì

Một trang đơn giản, gồm:

- Dòng chữ **"Đang chuyển hướng an toàn tới: ..."** kèm địa chỉ trang đích
- Một **vòng tròn đếm ngược** đang vơi dần
- Dòng **"Sẽ chuyển hướng sau 3 giây."**
- Một nút **"Đi đến trang đích"** — nút này **mờ, bấm không được** cho tới khi đếm ngược về 0. Đây là yêu cầu trong mô tả của bạn, mình làm đúng vậy.

Hết giờ, trang tự chuyển. Ai sốt ruột thì đợi hết đếm ngược rồi bấm nút.

Trang này được đánh dấu **"đừng lập chỉ mục"** để Google không đưa nó vào kết quả tìm kiếm.

---

## 4. Hệ thống ghi lại những gì

Mỗi lượt truy cập lưu một dòng: link nào, lúc mấy giờ, trình duyệt gì, đến từ đâu.

**Không lưu địa chỉ IP thật.** IP được băm thành một chuỗi ký tự không đọc ngược ra được — vẫn phân biệt được hai người khác nhau, nhưng không truy ra người cụ thể.

### Một vấn đề thật, phải xử lý

Link này nằm trong email. Mà Gmail, Outlook và phần mềm quét thư của công ty **tự động mở mọi link trong thư để kiểm tra virus**, trước cả khi người nhận kịp nhìn thấy email.

Nếu đếm hết thì con số click sẽ bị thổi phồng, báo cáo thành vô nghĩa.

Cách xử lý: hệ thống phân biệt **"máy mở"** và **"người mở"** bằng hai lớp kiểm tra, rồi báo cáo tách hai con số. Phần này không có trong mô tả ban đầu nhưng mình đưa vào ngay từ đầu, vì thêm sau thì toàn bộ số liệu cũ không cứu được.

---

## 5. Khi có sự cố

Nếu vì lý do gì đó hệ thống không tra ra được link:

- Hệ thống kiểm tra **chữ ký bảo mật** đi kèm trong địa chỉ. Chữ ký này chứng minh địa chỉ do chính hệ thống tạo ra, không phải ai đó tự bịa. Chữ ký hợp lệ thì chuyển thẳng người dùng sang trang đích — họ không bị kẹt.
- Không có chữ ký, hoặc chữ ký sai, hoặc địa chỉ đích trông đáng ngờ → hiện trang báo lỗi **"404 — Link không tồn tại hoặc đã hết hiệu lực"**.

---

## 6. Bốn chỗ mình cố ý làm khác mô tả ban đầu

Đây là phần đáng để bạn đọc kỹ nhất.

### 6.1. Hạn chữ ký: 10 phút → 30 ngày

Mô tả ghi chữ ký hết hạn sau 10 phút. Nhưng link này gửi qua email, người nhận thường bấm sau vài giờ tới vài ngày.

Nghĩa là cái lưới an toàn ở mục 5 gần như **không bao giờ kịp bung ra** — tới lúc cần thì chữ ký đã hết hạn từ lâu.

Mình để mặc định 30 ngày, và đặt thành một dòng cấu hình để bạn chỉnh lúc nào cũng được.

### 6.2. Thêm khoá cho cửa tạo link

Mô tả không nói ai được phép tạo link. Nếu để mở, **bất kỳ ai trên internet cũng tạo được link chuyển hướng mang tên miền của bạn** — và đó chính xác là thứ kẻ lừa đảo cần: một địa chỉ trông đáng tin để dẫn nạn nhân sang trang giả mạo. Tên miền của bạn mất uy tín, có thể bị Google gắn cờ.

Mình thêm một mật khẩu cho cửa này. Agent phải có mật khẩu mới tạo được link.

### 6.3. Sửa cách ghép chữ ký

Chi tiết kỹ thuật, nói ngắn: cách ghép chữ ký trong mô tả có một lỗ hổng khiến **hai link khác nhau có thể sinh ra cùng một chữ ký**. Mình sửa cách ghép để không còn trùng. Không ảnh hưởng gì tới cách bạn dùng.

### 6.4. Thêm phần lọc "máy mở" khỏi "người mở"

Đã nói ở mục 4.

---

## 7. Chạy ở đâu

| | |
|---|---|
| Nền tảng | Hostinger, dạng ứng dụng Node.js |
| Cơ sở dữ liệu | MySQL của Hostinger |
| Địa chỉ web | Tạm dùng địa chỉ miễn phí Hostinger cấp, dạng `xxx-yyy-123456.hostingersite.com` |
| Sau này | Đổi sang `go.reviewking.info` — chỉ sửa **một dòng cấu hình**, không phải làm lại gì |

**Tài khoản Hostinger:** `tranthithu64082g@gmail.com`, gói Cloud Startup — đã chốt.

---

## 8. Bạn cần chuẩn bị gì

Không còn gì chặn lại. Mọi thứ dưới đây đều **không gấp**, bổ sung lúc nào cũng được:

- **Google Analytics** — công cụ miễn phí của Google để xem báo cáo lượt bấm. Mình code sẵn chỗ cắm nhưng để trống. Khi nào bạn tạo tài khoản và có mã dạng `G-XXXXXXXXXX` thì điền vào một dòng cấu hình là chạy, không phải sửa code, không phải build lại. Trong lúc chưa có, hệ thống vẫn tự đếm và lưu vào cơ sở dữ liệu riêng nên **bạn không mất số liệu nào**.
- **Tên miền `reviewking.info`** — mua và trỏ về Hostinger lúc nào cũng được.
- **Câu hỏi bạn đang hỏi lại bên bạn:** khi chuyển sang trang đích, có cần mang theo các tham số đánh dấu chiến dịch (`utm_source=email`...) không? Mình tạm để **không mang theo**, nhưng làm thành một công tắc bật/tắt được cho từng link — nên bạn trả lời lúc nào cũng kịp.

---

## 9. Bao lâu xong

Khoảng **5–6 ngày làm việc** cho toàn bộ: hệ thống tạo link, trang chờ, ghi nhận số liệu, lọc bot, xử lý sự cố, kiểm thử, và đưa lên chạy thật.

Mình làm trọn một lượt như bạn yêu cầu, không chia giai đoạn. Xong sẽ có bản chạy được trên địa chỉ thật để bạn bấm thử.
