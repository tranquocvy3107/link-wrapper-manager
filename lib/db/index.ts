import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getConfig } from '../config'
import * as schema from './schema'

/**
 * Pool dùng chung.
 *
 * Giữ trên globalThis vì hot-reload của Next.js trong chế độ dev nạp lại module
 * mỗi lần sửa file — không cache thì mỗi lần sửa lại mở thêm một pool, vài phút
 * là hết connection slot của Postgres.
 */
const globalForDb = globalThis as unknown as {
  __lwmPool?: Pool
  __lwmDb?: ReturnType<typeof drizzle<typeof schema>>
}

function createPool(): Pool {
  const cfg = getConfig()

  return new Pool({
    connectionString: cfg.databaseUrl,
    // Render Postgres: Internal URL trong cùng region không cần SSL.
    // External URL (kết nối từ máy cá nhân) thì cần, và chứng chỉ do Render tự
    // cấp nên phải tắt kiểm tra CA.
    ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

export function getPool(): Pool {
  if (!globalForDb.__lwmPool) {
    globalForDb.__lwmPool = createPool()
  }
  return globalForDb.__lwmPool
}

export function getDb() {
  if (!globalForDb.__lwmDb) {
    globalForDb.__lwmDb = drizzle(getPool(), { schema })
  }
  return globalForDb.__lwmDb
}

export { schema }
