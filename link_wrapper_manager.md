# Link Wrapper Manager — Luồng xử lý traffic trước khi chuyển đến trang dự án gốc

## 1. Thông tin ứng dụng

* **Tên ứng dụng:** Link Wrapper Manager
* **Mục tiêu:** Hứng và ghi nhận traffic trên trang bọc trước khi chuyển người dùng đến URL gốc của dự án.
* **MCP tools:**

  * `generate_redirect_url`
  * `get_redirect_data`

---

## 2. Bước 1 — Tạo URL redirect

Agent gọi MCP tool `generate_redirect_url` với các tham số:

```json
{
  "destination_url": "https://projecta.com?code=abcxyz",
  "title": "Project A",
  "desc": "Mô tả ngắn",
  "alias": "project-a",
  "time_wait": 3000,
  "parameters": [
    {
      "key": "utm_source",
      "value": "email"
    },
    {
      "key": "continue",
      "value": "{{destination_url}}"
    }
  ]
}
```

| Tham số           | Mô tả                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `destination_url` | URL gốc của dự án cần chuyển hướng đến.                                                               |
| `title`           | Tiêu đề hiển thị trên trang bọc; dùng để phân loại dữ liệu trong GA4.                                 |
| `desc`            | Mô tả ngắn hiển thị trên trang bọc.                                                                   |
| `alias`           | Đường dẫn URL đại diện cho dự án. Nếu để trống, hệ thống tự tạo từ `title` theo định dạng `URL_SLUG`. |
| `time_wait`       | Thời gian chờ trên trang bọc trước khi redirect, tính bằng mili giây.                                 |
| `parameters`      | Danh sách tham số được gắn thêm vào URL sau khi tạo.                                                  |

### Backend xử lý `generate_redirect_url`

1. Kiểm tra và chuẩn hoá dữ liệu đầu vào.
2. Tạo hoặc kiểm tra tính duy nhất của `alias`.
3. Lưu bản ghi link vào database, bao gồm toàn bộ tham số đầu vào.
4. Dùng `alias` làm mã tham chiếu của link.
5. Tạo chữ ký: SIGN = HMAC_SHA256(alias + continue + expires) trong đó expires = timestamp hiện tại + 10 phút
6. Trả về URL theo cấu trúc:

```text
https://go.reviewking.info/r/{alias}?{parameters}&expires=1790043870&signature={{SIGN}}
```

Ví dụ:

```text
https://go.reviewking.info/r/project-a?utm_source=email&continue=https%3A%2F%2Fprojecta.com%3Fcode%3Dabcxyz&expires=1790043870&signature={{SIGN}}
```

---

## 3. Bước 2 — Gắn link vào email

Agent nhận URL từ `generate_redirect_url`, sau đó chèn URL này vào email template và gửi đến người nhận.

---

## 4. Bước 3 — Người dùng truy cập link

Khi người dùng bấm vào URL wrapper, frontend xử lý theo luồng sau:

1. Lấy `alias` và các query parameters từ URL.
2. Gọi MCP tool `get_redirect_data` để lấy cấu hình link theo `alias`.
3. Backend ghi nhận một lượt truy cập vào database.
4. Frontend thiết lập:

   * `title` và `description` của trang.
   * Meta robots: `noindex, nofollow`.
   * Mã theo dõi GA4.
5. Hiển thị giao diện trang bọc:

   * Tiêu đề: `Đang chuyển hướng an toàn tới: {destination_url}`.
   * Vòng tròn đếm ngược theo `time_wait`.
   * Thông báo: `Sẽ chuyển hướng sau {n} giây.`
   * Nút redirect thủ công: `Đi đến trang đích`.
6. Khi hết thời gian đếm ngược, tự động chuyển hướng bằng JavaScript:

```javascript
window.location.replace(destination_url);
```

7. Nút redirect thủ công chỉ được kích hoạt sau khi kết thúc đếm ngược.

---

## 5. Fallback

Nếu `alias` không tồn tại hoặc không thể lấy dữ liệu redirect:

1. Kiểm tra so sánh chữ ký với dữ liệu truyền vào trong parameters.
2. Nếu chữ ký hợp lệ, redirect trực tiếp đến URL ở `continue` này.
3. Nếu không có hoặc URL không hợp lệ, hiển thị trang lỗi `404 — Link không tồn tại hoặc đã hết hiệu lực`.
