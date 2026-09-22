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

**Ba sự kiện gửi lên GA4:** `page_view` (GA4 tự gửi, kèm `page_title` = title của link), `auto_redirect` và `manual_redirect` (kèm tham số `destination_url`). Không có sự kiện `wrapper_view` — `page_view` đã làm đúng việc đó, thêm nữa là đếm trùng.

**GA4 luôn đếm thấp hơn database.** Trình chặn quảng cáo chặn gtag, người tắt JS không gửi được gì, và trang chỉ chờ 3 giây nên trên mạng chậm gtag có thể chưa kịp gửi. Database ghi ở phía server nên không dính vấn đề nào — **coi số trong database là con số thật**, GA4 để xem hành vi và nguồn traffic.

### 3.9. Không mang `utm_*` sang trang đích

Mặc định tắt. Các tham số `utm_*` phục vụ GA4 trên chính trang bọc, không phải trang đích.

Người dùng chưa chốt dứt khoát nên làm thành cờ `forward_params` bật/tắt theo từng link — trả lời lúc nào cũng kịp, không phải sửa code.

### 3.10. Nền trắng cố định, bỏ dark mode

Ban đầu trang tự đổi màu theo `prefers-color-scheme` của máy người nhận. Bỏ hẳn.

Đây là trang chuyển tiếp chỉ hiện vài giây. Nền trắng thống nhất cho mọi người thì dễ đoán hơn, và khớp với phần lớn email template — người nhận đang đọc email nền trắng, bấm link ra trang đen là giật mắt.

`color-scheme: light` trong [app/globals.css](app/globals.css) để trình duyệt không tự bôi tối thanh cuộn và các thành phần gốc khi máy đang bật dark mode.

### 3.11. Nhiều token, mỗi bên một cái

Ban đầu chỉ có một `MCP_API_TOKEN`. Khi cần cho nhiều phòng ban dùng, một token chung có hai vấn đề: không thu hồi được riêng bên nào, và không biết link nào do ai tạo.

Chốt: `MCP_API_TOKENS` dạng `nhãn:token,nhãn:token`. Nhãn được ghi vào cột `created_by`. `MCP_API_TOKEN` cũ vẫn chạy với nhãn `default` nên không phá cấu hình sẵn có.

Xác thực duyệt hết danh sách thay vì thoát sớm khi khớp, để thời gian phản hồi không tiết lộ token nằm ở vị trí nào — xem [lib/auth.ts](lib/auth.ts).

### 3.12. Thêm tool `update_redirect_url`

Không có trong spec. Nhưng tạo link xong là không sửa được gì: đổi thời gian chờ, sửa tiêu đề sai chính tả, hay tắt một link đã lỡ gửi đều không làm được — chỉ còn cách tạo link mới với alias khác, mà email cũ thì đã gửi rồi.

Tool này sửa được `title`, `desc`, `destination_url`, `time_wait`, `forward_params`, `status`. **Alias cố ý không sửa được** — alias nằm trong URL đã gửi đi, đổi là mọi email cũ chết.

Cảnh báo nằm trong mô tả tool: đổi `destination_url` chỉ đổi luồng chính. Các URL đã gửi mang sẵn tham số `continue` trỏ tới đích cũ kèm chữ ký của nó, nên nhánh dự phòng của những email đó vẫn dẫn về đích cũ.

### 3.13. Tự viết lớp JSON-RPC cho MCP thay vì dùng SDK

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
- **`git push` KHÔNG tự deploy.** Service bật `autoDeploy: yes`, nhưng repo được nối với Render bằng **URL công khai** chứ không qua GitHub App, nên Render không nhận được webhook từ GitHub. Phải bấm **Manual Deploy** trong dashboard (hoặc gọi API `trigger_deploy`). Muốn tự động thì vào Render kết nối tài khoản GitHub `tranquocvy3107`, rồi chọn lại repo cho service.
- **Gói free của Render ngủ sau 15 phút không có traffic**, lần đánh thức đầu mất vài chục giây. Với link trong email thì lần bấm đầu tiên sau một thời gian dài sẽ chậm. Muốn tránh phải lên gói starter.

---

## 5. Tài nguyên đã tạo

| | |
|---|---|
| Repo | https://github.com/tranquocvy3107/link-wrapper-manager — **công khai**, sẽ chuyển sang HenryJz145 sau |
| Web service | `link-wrapper` · `srv-dap05b740ujc73b3d2mg` · https://link-wrapper.onrender.com |
| Database | `link-wrapper-db` · `dpg-dap04go0cd8s73b90q8g-a` · Postgres 18, Singapore |

Cả hai đều **gói free**, cố ý — để nghiệm thu trước khi trả tiền. Hai hạn chế phải nhớ:

- **Database free bị Render xoá ngày 2026-10-22.** Nâng lên `basic_256mb` trước ngày đó, nếu không mọi link đã gửi sẽ chết.
- **Web service free ngủ sau 15 phút** không có traffic; lần đánh thức đầu mất vài chục giây. Với link email bấm thưa thớt, nhiều người nhận sẽ gặp màn hình trắng khá lâu. Nâng lên `starter` trước khi gửi email thật.

## 6. Trạng thái deploy

Build **thành công** (TypeScript pass, cả 6 route sinh đúng). Khởi động **thất bại** ở đúng một chỗ: thiếu `DATABASE_URL`.

Đây không phải lỗi — Render cố tình không cho API đọc mật khẩu database, nên biến này phải điền tay một lần trong dashboard. Mọi biến môi trường khác đã set xong.

Sau khi điền `DATABASE_URL` (Internal Database URL của `link-wrapper-db`), Render tự deploy lại; `startCommand` sẽ chạy `scripts/migrate.mjs` tạo bảng rồi khởi động app. Script idempotent nên chạy lại mỗi lần restart là vô hại.

### Kiểm tra sau khi lên

```bash
curl -s https://link-wrapper.onrender.com/api/health
```

Mong đợi `{"status":"ok","database":"up"}`. Nếu ra `503` thì `DATABASE_URL` sai hoặc database chưa sẵn sàng.

## 7. Nghiệm thu đầu-cuối (2026-09-22, trên bản đã deploy)

| Kiểm tra | Kết quả |
|---|---|
| `/api/health` | `{"status":"ok","database":"up"}` |
| `/api/mcp` không token | HTTP 401 |
| `initialize` | protocol `2025-06-18`, server `link-wrapper-manager@1.0.0` |
| Tạo link, title `Dự án Á Đông` | alias `du-an-a-dong` — slug tiếng Việt đúng |
| Encode `continue` | `https%3A%2F%2Fexample.com%3Fcode%3Dabcxyz` — khớp spec |
| Trang bọc | title + description đúng, `x-robots-tag: noindex, nofollow, noarchive`, meta robots `noindex, nofollow, nocache` |
| Nút thủ công | có `disabled` |
| URL đích | giữ nguyên `https://example.com?code=abcxyz`, không bị thêm `/` |
| Alias không tồn tại, không chữ ký | HTTP 404 |
| Chữ ký hợp lệ + continue an toàn | HTTP 307 → đúng đích |
| Chữ ký hợp lệ + `javascript:alert(1)` | HTTP 404 — chặn được open-redirect |
| Chữ ký hết hạn | HTTP 404 |
| Chữ ký sửa 1 ký tự | HTTP 404 |
| Đếm click | 4 lượt mở → 3 bot (curl, GoogleImageProxy, prefetch) + **1 click thật** |

### Bẫy khi test trên Windows

Lần tạo link đầu tiên ra alias `d-n-ng` thay vì `du-an-a-dong`. **Không phải lỗi code** — console Windows làm hỏng UTF-8 trong tham số `-d` của curl, title tới server đã thành `D? � n � ��ng` (có `U+003F` và `U+FFFD`). Ghi payload ra file UTF-8 rồi `--data-binary @file` thì đúng ngay.

Link rác `d-n-ng` vẫn nằm trong database, vô hại, xoá lúc nào cũng được.

## 8. Còn lại

- [x] Điền `DATABASE_URL` trong dashboard Render
- [ ] Nâng gói database trước 2026-10-22
- [ ] Nâng gói web service trước khi gửi email thật
- [ ] Điền `GA4_ID` khi có tài khoản Google Analytics (chỉ cần restart, không build lại)
- [ ] Chốt `forward_params`: có mang `utm_*` sang trang đích không — hiện mặc định tắt
- [ ] Trỏ domain `go.reviewking.info` và đổi `PUBLIC_BASE_URL`
- [ ] Chuyển repo sang tài khoản HenryJz145
