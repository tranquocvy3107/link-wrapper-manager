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

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
})

try {
  await client.connect()
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
