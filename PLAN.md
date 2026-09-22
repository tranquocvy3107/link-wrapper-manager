# Link Wrapper Manager — Kế hoạch triển khai (bản kỹ thuật)

> Spec gốc: [link_wrapper_manager.md](link_wrapper_manager.md) · Bản tóm tắt dễ đọc: [PLAN_sum.md](PLAN_sum.md)
> Cập nhật 2026-09-22 — chuyển hạ tầng từ Neon/Vercel sang Hostinger/MySQL.

## Quyết định đã chốt

| Hạng mục | Chốt |
|---|---|
| Kiến trúc | Next.js 15 App Router, all-in-one |
| Database | **MySQL 8 trên Hostinger** |
| Deploy | **Hostinger Node.js hosting**, account `u948403593` (`tranthithu64082g@gmail.com`) |
| Địa chỉ | Subdomain miễn phí `*.hostingersite.com`, đổi sang `go.reviewking.info` sau |
| GA4 | Để trống, cắm sau bằng biến môi trường — **không cần build lại** (xem §7) |
| Hạn chữ ký | `SIGNATURE_TTL` qua env, mặc định 30 ngày (lệch spec, xem §4) |
| Chuyển utm sang đích | Không, mặc định tắt. Có cờ `forward_params` bật theo từng link |
| Cách làm | Làm trọn một lượt, không chia giai đoạn |

### Hiện trạng hạ tầng (khảo sát read-only trên account `u948403593`)

- Gói Cloud Startup, hết hạn 2027-08-01. Truy cập qua collaborator access.
- Server `srv1032.hstgr.io`, MySQL cổng 3306, giới hạn 6 GB/database.
- Đã có 5 website Node.js đang chạy → nền tảng hỗ trợ Next.js.
- `reviewking.info` **không** có trong account; danh sách domain đăng ký qua Hostinger đang trống.
- Đang có 42 database, sẽ tạo thêm một cái riêng cho dự án này.

---

## 1. Kiến trúc

```
                    ┌──────────────────────────────────────────┐
  Agent ──MCP──────>│  /api/mcp   (Streamable HTTP + Bearer)    │
                    │    ├─ generate_redirect_url               │
                    │    └─ get_redirect_data                   │
                    ├──────────────────────────────────────────┤
  User ──click─────>│  /r/[alias] (SSR: meta động + countdown)  │
                    ├──────────────────────────────────────────┤
  Browser ─beacon──>│  /api/track (xác nhận click thật)         │
                    ├──────────────────────────────────────────┤
                    │  lib/links.service.ts  ← nguồn sự thật    │
                    └──────────────┬───────────────────────────┘
                                   │ 127.0.0.1:3306
                          MySQL (links, link_visits)
```

MCP tool và trang bọc **gọi chung một service layer**, không gọi HTTP vòng qua nhau. Spec viết "frontend gọi MCP tool `get_redirect_data`" — ý đồ là "lấy cấu hình theo alias"; server component gọi thẳng service đạt đúng ý đó mà không tốn round-trip. Tool MCP vẫn tồn tại đầy đủ cho agent.

**Stack:** Next.js 15 + TypeScript · Tailwind CSS · Drizzle ORM (`drizzle-orm/mysql2`) · Zod · `@modelcontextprotocol/sdk` · Vitest.

**Kết nối DB:** từ app luôn dùng `127.0.0.1:3306`, **không** dùng `srv1032.hstgr.io` (host đó chỉ dành cho kết nối từ ngoài Hostinger, và phải bật remote connection trước). Dùng `127.0.0.1` chứ không phải `localhost` vì `localhost` có thể resolve ra IPv6 `::1` mà database user không được cấp quyền.

---

## 2. Cấu trúc thư mục

```
app/
  r/[alias]/page.tsx          # SSR: generateMetadata + fallback + render
  r/[alias]/not-found.tsx     # 404 — Link không tồn tại hoặc đã hết hiệu lực
  api/mcp/route.ts            # MCP endpoint, 2 tools
  api/track/route.ts          # Beacon xác nhận click thật
  layout.tsx
components/
  RedirectCountdown.tsx       # 'use client' — vòng tròn SVG + nút thủ công
  Ga4Script.tsx               # 'use client' — nhận measurementId qua prop
lib/
  db/schema.ts · db/index.ts
  links.service.ts            # createLink / getLinkByAlias / recordVisit / markRedirected
  signature.ts                # sign / verify — canonical string ở đúng 1 chỗ
  slug.ts                     # slugify tiếng Việt + đảm bảo unique
  params.ts                   # resolve {{...}} + build query string
  url-guard.ts                # chỉ http/https, chặn host nội bộ
  bot.ts                      # nhận diện bot / prefetch
  schemas.ts                  # Zod, dùng lại làm input schema của MCP
  auth.ts · config.ts
drizzle/                      # migrations
```

`next.config.ts` đặt `output: 'standalone'` để gói deploy nhẹ, hợp với Node.js hosting của Hostinger.

---

## 3. Data model (MySQL 8)

```sql
CREATE TABLE links (
  id              CHAR(36)     NOT NULL PRIMARY KEY,      -- UUID sinh ở tầng app
  alias           VARCHAR(64)  NOT NULL UNIQUE,
  destination_url TEXT         NOT NULL,
  title           VARCHAR(200) NOT NULL,
  description     VARCHAR(500) NULL,
  time_wait       INT          NOT NULL DEFAULT 3000,
  parameters      JSON         NOT NULL,                  -- [{key,value}] đã resolve template
  forward_params  TINYINT(1)   NOT NULL DEFAULT 0,        -- có mang utm_* sang đích không
  status          VARCHAR(16)  NOT NULL DEFAULT 'active', -- active | disabled
  expires_at      DATETIME     NULL,                      -- hạn của LINK, khác expires của chữ ký
  created_by      VARCHAR(64)  NULL,                      -- id của API key gọi tool
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE link_visits (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  link_id     CHAR(36)     NULL,
  alias       VARCHAR(64)  NOT NULL,   -- denormalize: giữ số liệu kể cả khi link bị xoá
  visited_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash     CHAR(64)     NULL,       -- sha256(ip + IP_SALT), KHÔNG lưu IP thô
  user_agent  VARCHAR(512) NULL,
  referer     VARCHAR(512) NULL,
  query       JSON         NULL,       -- toàn bộ query params lúc truy cập
  country     CHAR(2)      NULL,       -- để null ở v1, xem ghi chú bên dưới
  is_bot      TINYINT(1)   NOT NULL DEFAULT 0,
  redirected  TINYINT(1)   NOT NULL DEFAULT 0,
  visit_token CHAR(32)     NULL,       -- khớp beacon /api/track với đúng lượt truy cập
  CONSTRAINT fk_visits_link FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE SET NULL,
  INDEX idx_alias_time  (alias, visited_at),
  INDEX idx_link_time   (link_id, visited_at),
  INDEX idx_visit_token (visit_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Ghi chú MySQL:**

- Dùng `DATETIME` chứ không `TIMESTAMP` (tránh giới hạn 2038 và chuyển đổi timezone ngầm). Ghi UTC, set `timezone: 'Z'` trong connection options của mysql2.
- `link_id` nullable + `ON DELETE SET NULL`: xoá link vẫn giữ lịch sử truy cập, tra cứu bằng `alias`.
- Cột `country` để null ở v1. Trên Vercel có header geo sẵn, Hostinger thì không — muốn có phải thêm thư viện tra IP→quốc gia. Để dành, cột đã sẵn nên thêm sau không cần migration.

---

## 4. Đặc tả chữ ký (chốt chính xác)

Cả `sign` lẫn `verify` gọi **cùng một hàm dựng canonical string** trong `lib/signature.ts`:

```ts
canonical = `${alias}\n${continueRaw}\n${expires}`
// continueRaw : giá trị `continue` SAU khi decode (URL gốc); chuỗi rỗng nếu không có
// expires     : unix seconds, dạng string
SIGN = hmacSha256Hex(LINK_SIGNING_SECRET, canonical)
```

Verify so sánh bằng `crypto.timingSafeEqual`.

**Hai chỗ lệch spec, đều cố ý:**

1. **TTL 30 ngày thay vì 10 phút** (đã chốt). Fallback tồn tại để cứu tình huống alias tra không ra; với link email mà TTL 10 phút thì lớp cứu này gần như không bao giờ kịp chạy. Chỉnh qua `SIGNATURE_TTL`.
2. **Chèn `\n` làm dấu phân cách** thay vì nối trần `alias + continue + expires`. Nối trần gây nhập nhằng ranh giới: cặp `(alias="a", continue="bc")` sinh ra đúng chữ ký của `(alias="ab", continue="c")`. Nếu cần bám spec tuyệt đối thì sửa đúng một dòng.

---

## 5. Luồng `generate_redirect_url`

1. **Auth** — Bearer token. Bắt buộc: endpoint mở nghĩa là ai cũng tạo được redirect trên domain của bạn, biến nó thành công cụ phishing mượn uy tín.
2. **Validate** (Zod):
   - `destination_url` — URL tuyệt đối, scheme `http`/`https`
   - `title` — bắt buộc, ≤ 200 ký tự
   - `time_wait` — 0…60000, mặc định 3000
   - `alias` — `^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$`
   - `parameters` — mảng `{key, value}`
   - `forward_params` — boolean, mặc định `false`
3. **Sinh alias** — nếu trống: slugify `title` (NFD → bỏ dấu tiếng Việt → lowercase → ký tự lạ thành `-` → gộp và trim `-` → cắt 64). Trùng thì thêm `-2`, `-3`… (bắt lỗi `ER_DUP_ENTRY` rồi retry, quá 5 lần thì `-{nanoid(6)}`).
4. **Resolve template** trong `parameters[].value`: `{{destination_url}}`, `{{alias}}`, `{{title}}`.
5. **Insert** bản ghi `links` (UUID sinh bằng `crypto.randomUUID()`).
6. `expires = now + SIGNATURE_TTL`.
7. `signature = sign(alias, continueValue, expires)`.
8. **Build URL** — `${PUBLIC_BASE_URL}/r/${alias}?${qs}&expires=${expires}&signature=${sig}`, mỗi key và value qua `encodeURIComponent`.
9. **Trả về** `{ url, alias, link_id, expires }`.

---

## 6. Luồng `get_redirect_data`

Input `{ alias, record_visit?, include_stats? }`

1. Tra `links` theo `alias` với điều kiện `status='active'` và (`expires_at IS NULL` hoặc còn hạn).
2. Không thấy → trả `{ found: false }`, **không throw** — để trang bọc tự chuyển sang nhánh fallback.
3. `record_visit` → ghi `link_visits`, trả kèm `visit_token`.
4. Trả `{ found: true, alias, destination_url, title, desc, time_wait, parameters, forward_params, stats? }`.

`record_visit` mặc định `false` để agent tra cứu cấu hình mà không làm bẩn số liệu; trang bọc gọi service với `true`.

`include_stats` trả `{ total_views, real_clicks, last_visited_at }` — trong đó `real_clicks` đếm `redirected = 1 AND is_bot = 0`.

---

## 7. Trang bọc `/r/[alias]`

### Server component

- `generateMetadata` — `title`, `description` từ DB; `robots: { index: false, follow: false, googleBot: {...} }`.
- Set thêm **header** `X-Robots-Tag: noindex, nofollow`. Header thắng meta tag với nhiều crawler, meta tag một mình chưa đủ.
- Đọc `searchParams` rồi gọi `getLinkByAlias(alias)`:
  - **Tìm thấy** → ghi visit (lấy `visit_token`) → render UI.
  - **Không thấy** → `verifySignature(alias, continue, expires, signature)`:
    - hợp lệ + còn hạn + `continue` qua được `url-guard` → `redirect(continueUrl)` (307)
    - còn lại → `notFound()`
- URL đích truyền xuống client: nếu `forward_params = 1` thì merge query `utm_*` vào `destination_url`, ngược lại giữ nguyên.

### `RedirectCountdown` (client)

Props `destinationUrl`, `timeWaitMs`, `visitToken`.

- Vòng tròn SVG: `circumference = 2πr`, animate `strokeDashoffset` bằng `requestAnimationFrame` (mượt hơn `setInterval`, không lệch khi tab bị throttle), số giây hiển thị `Math.ceil(remaining / 1000)`.
- Nội dung: `Đang chuyển hướng an toàn tới: {destination_url}` + `Sẽ chuyển hướng sau {n} giây.`
- Nút `Đi đến trang đích` — `disabled` cho tới khi countdown về 0.
- Hết giờ → `navigator.sendBeacon('/api/track', visitToken)` → `window.location.replace(destinationUrl)`.
- `<noscript>` — `<meta http-equiv="refresh">` + thẻ `<a>` thường, dự phòng khi JS tắt.

### GA4 — thiết kế để cắm sau mà không phải build lại

Dùng biến `GA4_ID` (**không** đặt tên `NEXT_PUBLIC_*`). Next.js inline biến `NEXT_PUBLIC_*` vào bundle lúc build, nghĩa là điền mã sau sẽ phải build lại toàn bộ. Thay vào đó đọc `process.env.GA4_ID` trong server component rồi truyền xuống `Ga4Script` qua prop — lúc đó chỉ cần set env và restart app.

`Ga4Script` trả về `null` khi prop rỗng, nên hiện tại trang chạy sạch không có script thừa.

Events khi đã cắm mã: `wrapper_view`, `auto_redirect`, `manual_redirect`, kèm `page_title = link.title`.

---

## 8. Bảo mật

- [ ] `/api/mcp` yêu cầu Bearer token, không có → 401
- [ ] `destination_url` và `continue` chỉ nhận `http:` / `https:` — chặn `javascript:`, `data:`, `vbscript:`, `file:`
- [ ] Chặn host nội bộ: `localhost`, `127.0.0.0/8`, `169.254.0.0/16`, `.local`
- [ ] Cân nhắc allowlist domain đích qua `ALLOWED_DESTINATION_HOSTS`
- [ ] `timingSafeEqual` khi so chữ ký
- [ ] Rate limit `/api/mcp` và `/r/[alias]`
- [ ] Không lưu IP thô, chỉ `sha256(ip + IP_SALT)`
- [ ] CSP header cho trang bọc
- [ ] Mật khẩu MySQL và token chỉ nằm trong env của Hostinger, **không** commit vào repo

---

## 9. Lọc bot / prefetch

Link này nằm trong email, nên Gmail image proxy, Outlook SafeLinks và các bộ quét email doanh nghiệp sẽ tự mở link trước cả khi người nhận thấy nó. Không lọc thì số click bị thổi phồng và toàn bộ báo cáo mất giá trị.

Hai lớp:

1. **Nhận diện lúc request** — `is_bot` theo User-Agent patterns + header `Purpose: prefetch` / `X-Purpose` / `Sec-Purpose`.
2. **Xác nhận bằng JS** — chỉ tính click thật khi beacon `/api/track` bắn `visit_token` về (`redirected = 1`). Bộ quét email hầu như không chạy JS, nên lớp này bắt được cả loại giả mạo User-Agent.

Báo cáo: `redirected = 1 AND is_bot = 0` là click thật, `COUNT(*)` là tổng lượt mở.

---

## 10. Thứ tự dựng (làm trọn một lượt, ~5.5 ngày người)

1. `create-next-app` TS + Tailwind; `next.config.ts` bật `output: 'standalone'`; `lib/config.ts` validate env bằng Zod lúc boot.
2. Tạo database MySQL trên Hostinger; `lib/db/schema.ts` + migration Drizzle; chạy migration.
3. Hàm thuần + unit test: `signature.ts`, `slug.ts`, `params.ts`, `url-guard.ts`, `bot.ts`.
4. `links.service.ts` — createLink / getLinkByAlias / recordVisit / markRedirected / getStats.
5. `/api/mcp` — 2 tool, input schema từ Zod, auth Bearer. Test bằng MCP Inspector.
6. `/r/[alias]` — `generateMetadata`, header `X-Robots-Tag`, nhánh fallback chữ ký, `not-found.tsx`.
7. `RedirectCountdown` + `Ga4Script` + `<noscript>`.
8. `/api/track` + lọc bot.
9. Chạy toàn bộ test, smoke test local.
10. Tạo website Node.js trên Hostinger, set env, build, deploy, smoke test trên subdomain thật.

---

## 11. Definition of Done

- [ ] `generate_redirect_url` trả URL đúng định dạng spec
- [ ] Alias tự sinh từ title tiếng Việt có dấu ra slug sạch
- [ ] Alias trùng → tự thêm hậu tố, không bao giờ 500
- [ ] `{{destination_url}}` trong `parameters` được thay và encode đúng như ví dụ spec
- [ ] `/r/{alias}` trả HTML có `<title>`, `<meta name="description">`, `<meta name="robots" content="noindex, nofollow">` khớp DB
- [ ] Đếm ngược chạy đúng `time_wait`; nút thủ công disabled tới khi về 0
- [ ] Hết giờ → `window.location.replace(destination_url)`
- [ ] Mỗi lượt truy cập ghi một dòng `link_visits`
- [ ] Beacon `/api/track` cập nhật đúng dòng đó thành `redirected = 1`
- [ ] Alias không tồn tại + chữ ký hợp lệ + còn hạn → redirect thẳng tới `continue`
- [ ] Alias không tồn tại + chữ ký sai/hết hạn/thiếu → trang 404 đúng thông điệp
- [ ] `continue = javascript:...` → **không** redirect, ra 404
- [ ] Sửa một ký tự trong `signature` → từ chối redirect
- [ ] Gọi `/api/mcp` không token → 401
- [ ] Request có `Sec-Purpose: prefetch` → ghi `is_bot = 1`
- [ ] `GA4_ID` rỗng → trang không có script GA4, vẫn chạy bình thường
- [ ] Deploy lên subdomain Hostinger, tạo link thật và bấm thử thành công

---

## 12. Test case bắt buộc (Vitest)

**signature.ts**
- sign → verify round-trip đúng
- Đổi `alias` / `continue` / `expires` → verify fail
- `expires` quá khứ → fail
- Không nhập nhằng ranh giới: `(alias="a", continue="bc")` ≠ `(alias="ab", continue="c")`

**slug.ts**
- `"Dự án Á Đông"` → `du-an-a-dong`
- `"Project A"` → `project-a`
- Ký tự lạ và khoảng trắng liên tiếp → gộp một dấu `-`, không thừa `-` ở đầu/cuối
- Trùng alias → `-2`, `-3`

**params.ts**
- `{{destination_url}}` được thay và encode khớp đúng ví dụ trong spec
- Placeholder không tồn tại → giữ nguyên, không crash

**url-guard.ts**
- `javascript:`, `data:`, `file:` → reject
- `http://localhost`, `http://127.0.0.1` → reject

**bot.ts**
- `Sec-Purpose: prefetch` → true
- User-Agent của GoogleImageProxy → true
- Chrome bình thường → false

---

## 13. Biến môi trường (set qua Hostinger, không commit)

```
DATABASE_URL=mysql://<db_user>:PASSWORD@127.0.0.1:3306/<db_name>
LINK_SIGNING_SECRET=          # random 32 bytes hex
IP_SALT=                      # random, dùng để hash IP
MCP_API_TOKEN=                # Bearer token cho /api/mcp
PUBLIC_BASE_URL=              # https://<subdomain>.hostingersite.com, sau đổi thành https://go.reviewking.info
SIGNATURE_TTL=2592000         # giây, mặc định 30 ngày
GA4_ID=                       # để trống; điền G-XXXXXXX sau, chỉ cần restart
ALLOWED_DESTINATION_HOSTS=    # tuỳ chọn, phân tách bằng dấu phẩy
```

Set bằng `hosting_replaceNode_jsEnvironmentVariablesV1` — lưu ý API này **thay toàn bộ** danh sách, không phải thêm từng cái.
