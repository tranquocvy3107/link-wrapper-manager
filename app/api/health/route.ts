import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Health check cho Render. Kiểm cả kết nối database chứ không chỉ "process còn sống". */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`)
    return Response.json({ status: 'ok', database: 'up' })
  } catch (err) {
    return Response.json(
      { status: 'degraded', database: 'down', error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
