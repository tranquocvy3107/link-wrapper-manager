#!/usr/bin/env node
/**
 * Chạy các file SQL trong thư mục drizzle/ theo thứ tự tên file.
 *
 * Vì sao không dùng `drizzle-kit migrate`: schema ở đây nhỏ và ổn định, viết
 * SQL tay thì kiểm soát được chính xác DDL sinh ra (kiểu cột, index, hành vi
 * ON DELETE). Script này idempotent — mọi lệnh đều có IF NOT EXISTS.
 *
 * Dùng:
 *   node scripts/migrate.mjs
 *
 * Đọc DATABASE_URL và DATABASE_SSL từ môi trường. Kết nối từ máy cá nhân tới
 * Render Postgres thì dùng External Database URL và đặt DATABASE_SSL=true.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, '..', 'drizzle')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Thiếu DATABASE_URL.')
  process.exit(1)
}

const useSsl = ['1', 'true', 'yes', 'on'].includes(
  (process.env.DATABASE_SSL ?? '').trim().toLowerCase(),
)

/**
 * Số lần thử kết nối và khoảng cách giữa các lần.
 *
 * Vì sao cần: script này chạy trong `startCommand`, nên migration hỏng là app
 * không khởi động được. Database của Render khởi động lại trong vài tình huống
 * bình thường — đổi gói, bảo trì, chuyển node — và trong lúc đó nó từ chối kết
 * nối. Ngày 2026-10-01 đã dính đúng chuyện này: đổi gói database và deploy app
 * trùng thời điểm, migration gặp ECONNREFUSED và cả deploy chết theo.
 *
 * 10 lần × 3 giây = chịu được khoảng 30 giây database vắng mặt.
 */
const SO_LAN_THU = 10
const CHO_GIUA_HAI_LAN_MS = 3000

const nguPhutGiay = (ms) => new Promise((r) => setTimeout(r, ms))

function taoClient() {
  return new pg.Client({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  })
}

/** Chỉ thử lại với lỗi mạng. Sai mật khẩu hay sai tên database thì thử lại vô ích. */
function dangLaLoiTamThoi(err) {
  const code = err?.code ?? ''
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code) ||
    /starting up|shutting down|the database system is/i.test(err?.message ?? '')
  )
}

let client = null
for (let lan = 1; lan <= SO_LAN_THU; lan++) {
  client = taoClient()
  try {
    await client.connect()
    break
  } catch (err) {
    await client.end().catch(() => {})
    client = null

    if (!dangLaLoiTamThoi(err)) {
      console.error(`Không kết nối được database: ${err.message}`)
      process.exit(1)
    }
    if (lan === SO_LAN_THU) {
      console.error(`Không kết nối được database sau ${SO_LAN_THU} lần thử: ${err.message}`)
      process.exit(1)
    }

    console.log(
      `  Database chưa sẵn sàng (${err.code ?? err.message}), thử lại lần ${lan + 1}/${SO_LAN_THU} sau ${CHO_GIUA_HAI_LAN_MS / 1000}s...`,
    )
    await nguPhutGiay(CHO_GIUA_HAI_LAN_MS)
  }
}

try {
  console.log('Đã kết nối database.')

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

  if (files.length === 0) {
    console.log('Không có file .sql nào trong drizzle/.')
    process.exit(0)
  }

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8')
    process.stdout.write(`  ${file} ... `)
    await client.query(sql)
    console.log('xong')
  }

  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  )
  console.log(`\nBảng hiện có: ${rows.map((r) => r.table_name).join(', ') || '(không có)'}`)
} catch (err) {
  console.error('\nMigration thất bại:', err.message)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
