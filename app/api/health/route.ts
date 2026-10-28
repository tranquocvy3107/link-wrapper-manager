import { sql } from 'drizzle-orm'
import { checkBearer } from '@/lib/auth'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Thông tin runtime, CHỈ trả về khi gọi kèm Bearer token.
 *
 * Phiên bản Node là thông tin nhạy cảm vừa phải: nó cho người ngoài biết chính
 * xác những lỗ hổng nào đang hở trên máy chủ này. Nhưng người vận hành thì cần
 * biết, nếu không mỗi lần có advisory lại phải suy ra từ log build — mà log có
 * hạn lưu, và lần kiểm ngày 2026-10-28 đã dính đúng chuyện đó: log của bản
 * build đang chạy đã hết hạn, phải suy luận gián tiếp.
 */
function thongTinRuntime(headers: Headers) {
  try {
    if (!checkBearer(headers)) return undefined
  } catch {
    // Cấu hình hỏng thì vẫn phải trả lời health check, chỉ là không kèm chi tiết.
    return undefined
  }

  return {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    uptime_seconds: Math.round(process.uptime()),
  }
}

/** Health check cho Render. Kiểm cả kết nối database chứ không chỉ "process còn sống". */
export async function GET(request: Request) {
  const chiTiet = thongTinRuntime(request.headers)
  const kem = chiTiet ? { runtime: chiTiet } : {}

  try {
    await getDb().execute(sql`select 1`)
    return Response.json({ status: 'ok', database: 'up', ...kem })
  } catch (err) {
    return Response.json(
      {
        status: 'degraded',
        database: 'down',
        error: err instanceof Error ? err.message : String(err),
        ...kem,
      },
      { status: 503 },
    )
  }
}
