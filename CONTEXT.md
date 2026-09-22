# CONTEXT.md — Bối cảnh & nhật ký quyết định

> File này ghi lại **vì sao** dự án trông như bây giờ. Đọc file này trước khi sửa code.
> Tài liệu liên quan: [link_wrapper_manager.md](link_wrapper_manager.md) (spec gốc) · [PLAN.md](PLAN.md) (kỹ thuật) · [PLAN_sum.md](PLAN_sum.md) (tóm tắt)

---

## 1. Dự án này là gì

Trang bọc trung gian cho link gắn trong email. Người nhận bấm link → thấy trang chờ đếm ngược vài giây → tự chuyển sang trang đích. Trong lúc chờ, hệ thống ghi nhận lượt truy cập.

Hai công cụ MCP cho agent:

- `generate_redirect_url` — tạo link bọc
- `get_redirect_data` — đọc cấu hình + số liệu của một link

---

## 2. Hạ tầng đã chốt

| | |
|---|---|
| Hosting | **Render** — workspace `NEIT Dep's workspace` (`kaaiayy7222@gmail.com`), id `tea-d6ig6ak50q8c73b4dqlg` |
| Region | **Singapore** — khớp toàn bộ service sẵn có, và gần Việt Nam nhất |
| Database | **PostgreSQL 18 trên Render** |
| Nguồn deploy | GitHub repo → Render tự build (runtime `node`) |
| GitHub | `gh` CLI đã đăng nhập tài khoản `tranquocvy3107`, có scope `repo` |

### Mẫu cấu hình bám theo

Workspace này đã có một Next.js chạy thật trên Render — service `flux_pilot_R`. Mình dùng đúng công thức đó:

- `buildCommand`: cài deps → `next build`
- `startCommand`: `next start -p $PORT -H 0.0.0.0` — Render bắt buộc bind `0.0.0.0` và đọc `$PORT`, không được hardcode cổng
- `region: singapore`, `runtime: node`

Service đó build bằng `next build --webpack` (không dùng Turbopack). Giữ nguyên lựa chọn này cho chắc.

---

## 3. Nhật ký quyết định

Theo thứ tự thời gian, kèm lý do. Đây là phần quan trọng nhất của file.

### 3.1. Hạ tầng đổi hai lần trước khi chốt

| Lần | Chốt | Vì sao đổi |
|---|---|---|
| 1 | Neon Postgres + Vercel | Đề xuất ban đầu |
| 2 | Hostinger + MySQL | Người dùng muốn dùng gói Hostinger sẵn có |
| 3 | **Render + PostgreSQL** | Hostinger managed hosting **không có PostgreSQL** ở bất kỳ gói nào — chỉ MySQL/MariaDB. Render có Postgres native. |

Hệ quả: schema đã từng viết cho MySQL rồi chuyển lại sang Postgres. Nếu thấy dấu vết MySQL ở đâu trong lịch sử thì đó là lý do.

Một lợi ích phụ: tài khoản Hostinger truy cập qua **collaborator access** (hạ tầng của người khác chia sẻ quyền), chuyển sang Render là tài khoản của chính người dùng nên không còn vướng chuyện đó.

### 3.2. Một app Next.js thay vì tách backend/frontend

Trang bọc bắt buộc phải render phía server: `title`, `description` và thẻ `robots` phải lấy từ database **trước khi** trả HTML về. `generateMetadata` của Next.js giải quyết trọn vẹn.

Thêm nữa, MCP tool và trang bọc dùng **chung một service layer** (`lib/links.service.ts`) — không có hai đường code song song để lệch nhau.

### 3.3. Spec nói frontend gọi MCP tool `get_redirect_data`

Không làm đúng chữ. Server component gọi thẳng `links.service.ts`, không đi vòng qua HTTP. Ý đồ của spec là "lấy cấu hình theo alias" và cách này đạt đúng ý đó mà không tốn một round-trip mạng cho mỗi lượt truy cập.

Tool MCP `get_redirect_data` vẫn tồn tại đầy đủ cho agent dùng.

### 3.4. Hạn chữ ký: 10 phút → 30 ngày

Spec ghi `expires = now + 10 phút`.

Chữ ký chỉ dùng cho **nhánh dự phòng**: khi tra alias không ra, hệ thống kiểm chữ ký rồi chuyển thẳng người dùng tới `continue`. Nhưng link này nằm trong email — người nhận bấm sau vài giờ tới vài ngày. Với TTL 10 phút thì nhánh dự phòng gần như không bao giờ kịp chạy, tức là mất trắng lớp an toàn.

Chốt: mặc định **30 ngày**, chỉnh qua env `SIGNATURE_TTL`. Muốn quay về đúng spec thì đặt `SIGNATURE_TTL=600`.

### 3.5. Chuỗi ký có dấu phân cách

Spec ghi `HMAC_SHA256(alias + continue + expires)` — nối trần.

Nối trần gây nhập nhằng ranh giới: `(alias="a", continue="bc")` và `(alias="ab", continue="c")` cho ra **cùng một chuỗi** `"abc..."`, nên cùng một chữ ký. Kẻ tấn công kiểm soát được `continue` có thể lợi dụng.

Chốt: chèn `\n` giữa ba phần. Toàn bộ logic nằm trong `canonicalString()` của [lib/signature.ts](lib/signature.ts) — sửa một hàm đó là đổi được cách ký, cả `sign` lẫn `verify` đều gọi nó.

### 3.6. Thêm xác thực cho `/api/mcp`

Spec không nói ai được phép tạo link. Để mở thì bất kỳ ai cũng tạo được link chuyển hướng mang tên miền của dự án — đúng thứ kẻ lừa đảo cần. Domain mất uy tín, có thể bị Google gắn cờ.

Chốt: Bearer token (`MCP_API_TOKEN`), so sánh hằng thời gian.

### 3.7. Thêm lớp lọc bot/prefetch

Không có trong spec. Lý do: link nằm trong email, mà Gmail, Outlook SafeLinks và phần mềm quét thư doanh nghiệp **tự mở mọi link** để kiểm tra virus, trước cả khi người nhận thấy email. Không lọc thì số click bị thổi phồng.

Phải làm ngay từ đầu vì thêm sau thì toàn bộ số liệu cũ không cứu được.

Hai lớp:

1. Nhận diện lúc request — User-Agent + header `Sec-Purpose`/`Purpose`/`X-Purpose` → cột `is_bot`
2. Xác nhận bằng JS — beacon `/api/track` gửi `visit_token` về → cột `redirected`. Bộ quét email hầu như không chạy JS nên lớp này bắt được cả loại giả mạo User-Agent.

Click thật = `redirected = true AND is_bot = false`.

### 3.8. GA4 dùng biến `GA4_ID`, không phải `NEXT_PUBLIC_GA4_ID`

Người dùng chưa có tài khoản Google Analytics, sẽ bổ sung sau.

Next.js **nhúng cứng** biến `NEXT_PUBLIC_*` vào bundle lúc build. Nếu đặt tên vậy thì sau này điền mã phải build lại toàn bộ.

Chốt: đọc `process.env.GA4_ID` trong server component rồi truyền xuống client qua prop. Điền mã sau chỉ cần đổi env + restart, không build lại. Rỗng thì component trả `null`, trang sạch không script thừa.

### 3.9. Không mang `utm_*` sang trang đích

Mặc định tắt. Các tham số `utm_*` phục vụ GA4 trên chính trang bọc, không phải trang đích.

Người dùng chưa chốt dứt khoát nên làm thành cờ `forward_params` bật/tắt theo từng link — trả lời lúc nào cũng kịp, không phải sửa code.

### 3.10. Tự viết lớp JSON-RPC cho MCP thay vì dùng SDK

Route handler của Next.js App Router làm việc với `Request`/`Response` chuẩn web, còn `StreamableHTTPServerTransport` của MCP SDK nhắm vào `req`/`res` của Node — phải viết lớp chuyển đổi ở giữa.

Server này chỉ có 2 tool, không session, không sampling, không resource. Phần giao thức cần dùng gọn trong khoảng 150 dòng. Tự viết thì kiểm soát được hoàn toàn và không phụ thuộc vào API của SDK.

Nằm ở [lib/mcp/jsonrpc.ts](lib/mcp/jsonrpc.ts). Hỗ trợ `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`, và batch request.

---

## 4. Bẫy cần biết khi sửa code

- **`params` và `searchParams` là Promise.** Next.js 15 trở đi phải `await` chúng trong server component. Quên là lỗi khó hiểu.
- **Render bắt buộc bind `0.0.0.0` và đọc `$PORT`.** Hardcode cổng thì service không bao giờ healthy.
- **Postgres của Render cần SSL khi kết nối từ ngoài.** Trong cùng region dùng Internal Database URL thì không cần. Biến `DATABASE_SSL` điều khiển việc này.
- **Đừng đổi tên `GA4_ID` thành `NEXT_PUBLIC_GA4_ID`** — xem mục 3.8.
- **`đ` tiếng Việt không tự phân rã bằng NFD.** Phải thay tay trong [lib/slug.ts](lib/slug.ts), nếu không `"Dự án"` ra `du-Đan` thay vì `du-an`.
- **Gói free của Render ngủ sau 15 phút không có traffic**, lần đánh thức đầu mất vài chục giây. Với link trong email thì lần bấm đầu tiên sau một thời gian dài sẽ chậm. Muốn tránh phải lên gói starter.

---

## 5. Trạng thái hiện tại

Đang dựng code. Cập nhật mục này khi có thay đổi lớn.
