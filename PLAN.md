# Link Wrapper Manager — Kế hoạch triển khai (bản kỹ thuật)

> Spec gốc: [link_wrapper_manager.md](link_wrapper_manager.md) · Bản tóm tắt dễ đọc: [PLAN_sum.md](PLAN_sum.md)
> Cập nhật 2026-09-22 — hạ tầng chốt ở Render + PostgreSQL. Trạng thái triển khai thực tế: xem [CONTEXT.md](CONTEXT.md).

## Quyết định đã chốt

| Hạng mục | Chốt |
|---|---|
| Kiến trúc | Next.js 16 App Router, all-in-one |
| Database | **PostgreSQL 18 trên Render**, region Singapore |
| Deploy | **Render**, workspace `NEIT Dep's workspace` (`kaaiayy7222@gmail.com`) |
| Nguồn build | GitHub `tranquocvy3107/link-wrapper-manager` (công khai), runtime `node` |
| Địa chỉ | `https://link-wrapper.onrender.com`, đổi sang `go.reviewking.info` sau |
| GA4 | Để trống, cắm sau bằng biến môi trường — **không cần build lại** (xem §7) |
| Hạn chữ ký | `SIGNATURE_TTL` qua env, mặc định 30 ngày (lệch spec, xem §4) |
| Chuyển utm sang đích | Không, mặc định tắt. Có cờ `forward_params` bật theo từng link |
| Cách làm | Làm trọn một lượt, không chia giai đoạn |

### Hiện trạng hạ tầng (đã tạo thật)

- Web service `link-wrapper` · `srv-dap05b740ujc73b3d2mg` · gói free · Singapore
- Database `link-wrapper-db` · `dpg-dap04go0cd8s73b90q8g-a` · Postgres 18 · gói free
- Workspace đã có sẵn một Next.js chạy trên Render (`flux_pilot_R`) — cấu hình build/start bám theo mẫu đó.

⚠️ Cả hai đều gói free, cố ý để nghiệm thu trước khi trả tiền. Database free **bị xoá 2026-10-22**; web service free **ngủ sau 15 phút** không traffic. Xem [CONTEXT.md](CONTEXT.md) mục 5.

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
                                   │ Internal URL (cùng region)
                        PostgreSQL (links, link_visits)
```

MCP tool và trang bọc **gọi chung một service layer**, không gọi HTTP vòng qua nhau. Spec viết "frontend gọi MCP tool `get_redirect_data`" — ý đồ là "lấy cấu hình theo alias"; server component gọi thẳng service đạt đúng ý đó mà không tốn round-trip. Tool MCP vẫn tồn tại đầy đủ cho agent.

**Stack (bản mới nhất tại thời điểm dựng):** Next.js 16.3.5 · React 19.3 · TypeScript 7.0 · Tailwind CSS 4.3 · Drizzle ORM 0.45 (`drizzle-orm/node-postgres`) · Zod 4.6 · Vitest 5.0.

**Kết nối DB:** dùng **Internal Database URL** của Render — cùng region Singapore nên nhanh hơn và không cần SSL (`DATABASE_SSL=false`). External URL chỉ dùng khi kết nối từ máy cá nhân, và khi đó phải đặt `DATABASE_SSL=true` vì chứng chỉ do Render tự cấp.

**MCP:** tự viết lớp JSON-RPC thay vì dùng `@modelcontextprotocol/sdk` — lý do ở [CONTEXT.md](CONTEXT.md) mục 3.10.

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

`next.config.ts` đặt `outputFileTracingRoot` về thư mục dự án — thư mục cha có `package-lock.json` riêng khiến Next.js đoán nhầm workspace root. Cũng đặt header `X-Robots-Tag` cho `/r/:alias*` ở đây.

---

## 3. Data model (PostgreSQL)

DDL thật nằm ở [drizzle/0000_init.sql](drizzle/0000_init.sql); schema cho query builder ở [lib/db/schema.ts](lib/db/schema.ts). Hai file phải khớp nhau.

```sql
CREATE TABLE links (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  alias           varchar(64)  NOT NULL UNIQUE,
  destination_url text         NOT NULL,
  title           varchar(200) NOT NULL,
  description     varchar(500),
  time_wait       integer      NOT NULL DEFAULT 3000,
  parameters      jsonb        NOT NULL DEFAULT '[]'::jsonb,  -- [{key,value}] đã resolve
  forward_params  boolean      NOT NULL DEFAULT false,
  status          varchar(16)  NOT NULL DEFAULT 'active',
  expires_at      timestamptz,                                -- hạn của LINK, khác chữ ký
  created_by      varchar(64),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE link_visits (
  id          bigserial    PRIMARY KEY,
  link_id     uuid         REFERENCES links(id) ON DELETE SET NULL,
  alias       varchar(64)  NOT NULL,   -- denormalize: giữ số liệu kể cả khi link bị xoá
  visited_at  timestamptz  NOT NULL DEFAULT now(),
  ip_hash     char(64),                -- sha256(ip + IP_SALT), KHÔNG lưu IP thô
  user_agent  varchar(512),
  referer     varchar(512),
  query       jsonb,
  country     char(2),                 -- để null ở v1, xem ghi chú
  is_bot      boolean      NOT NULL DEFAULT false,
  redirected  boolean      NOT NULL DEFAULT false,
  visit_token char(32)                 -- khớp beacon /api/track với đúng lượt truy cập
);

CREATE INDEX idx_visits_alias_time ON link_visits (alias, visited_at);
CREATE INDEX idx_visits_link_time  ON link_visits (link_id, visited_at);
CREATE INDEX idx_visits_token      ON link_visits (visit_token);
```

**Ghi chú:**

- `gen_random_uuid()` có sẵn từ PostgreSQL 13, không cần extension `pgcrypto`.
- `link_id` nullable + `ON DELETE SET NULL`: xoá link vẫn giữ lịch sử truy cập, tra cứu bằng `alias`.
- Cột `country` để null ở v1. Render không gắn sẵn header geo; muốn có phải thêm thư viện tra IP→quốc gia. Cột đã sẵn nên thêm sau không cần migration.
- Thống kê dùng `count(*) FILTER (WHERE ...)` của Postgres — click thật là `redirected AND NOT is_bot`.

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

Sự kiện gửi lên GA4 khi đã cắm mã — đúng ba cái, không hơn:

| Sự kiện | Nguồn | Tham số |
|---|---|---|
| `page_view` | GA4 tự gửi từ `gtag('config', ...)` | `page_title` = title của link, `page_location` = URL đầy đủ |
| `auto_redirect` | Hết đếm ngược, tự chuyển | `destination_url` |
| `manual_redirect` | Người dùng bấm nút | `destination_url` |

⚠️ Tham số `destination_url` chỉ hiện trong báo cáo sau khi đăng ký Custom dimension trong GA4 Admin. Chưa đăng ký thì GA4 vẫn thu nhưng không lọc/nhóm theo nó được.

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
- [ ] Mật khẩu database và token chỉ nằm trong env của Render, **không** commit vào repo

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
2. Tạo Postgres trên Render; `lib/db/schema.ts` + `drizzle/0000_init.sql`; migration chạy ở `startCommand`.
3. Hàm thuần + unit test: `signature.ts`, `slug.ts`, `params.ts`, `url-guard.ts`, `bot.ts`.
4. `links.service.ts` — createLink / getLinkByAlias / recordVisit / markRedirected / getStats.
5. `/api/mcp` — 2 tool, input schema từ Zod, auth Bearer. Test bằng MCP Inspector.
6. `/r/[alias]` — `generateMetadata`, header `X-Robots-Tag`, nhánh fallback chữ ký, `not-found.tsx`.
7. `RedirectCountdown` + `Ga4Script` + `<noscript>`.
8. `/api/track` + lọc bot.
9. Chạy toàn bộ test, smoke test local.
10. Tạo repo GitHub + web service Render, set env, deploy, smoke test trên URL thật.

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
- [ ] Deploy lên Render, tạo link thật và bấm thử thành công

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

## 13. Biến môi trường (set trong dashboard Render, không commit)

Xem [.env.example](.env.example) để biết mô tả từng biến.

```
DATABASE_URL=                 # Internal Database URL của link-wrapper-db
DATABASE_SSL=false            # Internal URL cùng region thì không cần SSL
LINK_SIGNING_SECRET=          # random 32 bytes hex
IP_SALT=                      # random 16 bytes hex
MCP_API_TOKEN=                # Bearer token cho /api/mcp
PUBLIC_BASE_URL=https://link-wrapper.onrender.com
SIGNATURE_TTL=2592000         # giây, 30 ngày
DEFAULT_TIME_WAIT=3000
GA4_ID=                       # để trống; điền G-XXXXXXX sau, chỉ cần restart
ALLOWED_DESTINATION_HOSTS=    # tuỳ chọn, phân tách bằng dấu phẩy
NODE_VERSION=22
```

`render.yaml` trong repo mô tả toàn bộ hạ tầng và nối `DATABASE_URL` bằng `fromDatabase` — dùng khi cần dựng lại từ đầu qua Blueprint, lúc đó không ai phải copy mật khẩu ra ngoài.
