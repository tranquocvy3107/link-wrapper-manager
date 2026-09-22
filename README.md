# Link Wrapper Manager

Trang bọc trung gian cho link gắn trong email. Người nhận bấm link → thấy trang chờ đếm ngược → tự chuyển sang trang đích. Trong lúc chờ, hệ thống ghi nhận lượt truy cập.

Hai công cụ MCP cho agent: `generate_redirect_url` và `get_redirect_data`.

📖 [CONTEXT.md](CONTEXT.md) — vì sao dự án trông như thế này, đọc trước khi sửa code
📋 [PLAN.md](PLAN.md) — kế hoạch kỹ thuật · [PLAN_sum.md](PLAN_sum.md) — bản tóm tắt
📄 [link_wrapper_manager.md](link_wrapper_manager.md) — spec gốc

---

## Chạy ở máy

```bash
npm install
cp .env.example .env.local   # rồi điền các giá trị
node scripts/migrate.mjs     # tạo bảng
npm run dev
```

Sinh khoá bí mật:

```bash
node -e "console.log('LINK_SIGNING_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

```bash
node -e "console.log('IP_SALT=' + require('crypto').randomBytes(16).toString('hex')); console.log('MCP_API_TOKEN=' + require('crypto').randomBytes(24).toString('hex'))"
```

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production |
| `npm start` | Chạy bản đã build |
| `npm test` | Chạy unit test |
| `npm run typecheck` | Kiểm kiểu, không xuất file |
| `node scripts/migrate.mjs` | Áp schema vào database |

---

## Kết nối MCP từ Claude

Server chạy ở `https://link-wrapper.onrender.com/api/mcp`, giao thức Streamable HTTP, xác thực bằng Bearer token.

### Claude Code (CLI)

```bash
claude mcp add --transport http link-wrapper https://link-wrapper.onrender.com/api/mcp --header "Authorization: Bearer <MCP_API_TOKEN>" --scope user
```

`--scope user` để mọi dự án trên máy đều dùng được. Đổi thành `project` nếu chỉ muốn dùng trong một repo (khi đó cấu hình nằm ở `.mcp.json` và commit được — nhưng **đừng commit token**, dùng biến môi trường).

Kiểm tra bằng `/mcp` trong phiên Claude Code, hoặc:

```bash
claude mcp list
```

### Claude Desktop / claude.ai

Settings → Connectors → Add custom connector, điền URL `https://link-wrapper.onrender.com/api/mcp` và header `Authorization: Bearer <MCP_API_TOKEN>`.

### Kiểm tra thủ công

```bash
curl -s -X POST https://link-wrapper.onrender.com/api/mcp -H "Authorization: Bearer $MCP_API_TOKEN" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

⚠️ Trên Windows, **đừng nhét tiếng Việt thẳng vào tham số `-d` của curl** — console sẽ làm hỏng UTF-8 và title bị biến thành dấu hỏi. Ghi payload ra file rồi dùng `--data-binary @file.json`.

---

## Các đầu vào

### `POST /api/mcp`

Endpoint MCP, giao thức Streamable HTTP dạng stateless. Bắt buộc header:

```
Authorization: Bearer <MCP_API_TOKEN>
```

Liệt kê tool:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $MCP_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Tạo link:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $MCP_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"generate_redirect_url","arguments":{"destination_url":"https://projecta.com?code=abcxyz","title":"Project A","desc":"Mô tả ngắn","alias":"project-a","time_wait":3000,"parameters":[{"key":"utm_source","value":"email"},{"key":"continue","value":"{{destination_url}}"}]}}}'
```

### `GET /r/{alias}`

Trang bọc. Không tra được alias thì kiểm chữ ký trong query rồi chuyển thẳng tới `continue`; chữ ký sai hoặc hết hạn thì trả trang 404.

### `POST /api/track`

Beacon xác nhận trình duyệt thật đã chuyển hướng. Body là `visit_token` dạng text thuần. Luôn trả 204.

### `GET /api/health`

Kiểm tra sức khoẻ, có test cả kết nối database. Trả 503 khi database hỏng.

---

## Kiến trúc

```
app/
  r/[alias]/page.tsx      Trang bọc — SSR, metadata động, nhánh dự phòng chữ ký
  api/mcp/route.ts        Endpoint MCP
  api/track/route.ts      Beacon xác nhận click thật
  api/health/route.ts     Health check
components/
  RedirectCountdown.tsx   Vòng tròn đếm ngược + nút thủ công
  Ga4Script.tsx           GA4, nhận mã qua prop (xem CONTEXT.md mục 3.8)
lib/
  links.service.ts        Nguồn sự thật — MCP tool và trang bọc dùng chung
  signature.ts            Ký/kiểm HMAC-SHA256
  slug.ts                 Slug tiếng Việt + đảm bảo alias duy nhất
  url-guard.ts            Chống open-redirect và SSRF
  bot.ts                  Nhận diện bot/prefetch
  mcp/                    Giao thức JSON-RPC
```

---

## Biến môi trường

Xem [.env.example](.env.example). Ba biến bắt buộc phải sinh ngẫu nhiên: `LINK_SIGNING_SECRET`, `IP_SALT`, `MCP_API_TOKEN`.

`GA4_ID` để trống thì trang không nhúng script nào — điền sau chỉ cần restart, **không** phải build lại.

## Bảo mật

- Endpoint MCP yêu cầu Bearer token, so sánh hằng thời gian
- Mọi URL đích đi qua `url-guard`: chỉ `http`/`https`, chặn host nội bộ (chống SSRF)
- Chữ ký HMAC-SHA256 có dấu phân cách, không nhập nhằng ranh giới
- Không lưu IP thô, chỉ `sha256(ip + IP_SALT)`
- Trang bọc gắn `noindex, nofollow` ở cả thẻ meta lẫn header `X-Robots-Tag`
