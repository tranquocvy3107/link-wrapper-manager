import { timingSafeEqual } from 'node:crypto'
import { getConfig } from './config'

/**
 * Xác thực Bearer token cho /api/mcp.
 *
 * Spec gốc không nói tới xác thực, nhưng để endpoint tạo link mở nghĩa là bất
 * kỳ ai cũng dựng được link chuyển hướng mang tên miền của dự án — đúng thứ kẻ
 * lừa đảo cần. Domain mất uy tín và có thể bị Google gắn cờ.
 */
export function checkBearer(headers: Headers): boolean {
  const expected = getConfig().mcpApiToken

  const raw = headers.get('authorization') ?? ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  if (!match) return false

  const provided = match[1]!.trim()

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Nhãn ngắn để ghi vào cột `created_by`, không lộ token. */
export function tokenLabel(headers: Headers): string {
  const raw = headers.get('authorization') ?? ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  if (!match) return 'unknown'
  return `mcp:${match[1]!.trim().slice(0, 6)}`
}
