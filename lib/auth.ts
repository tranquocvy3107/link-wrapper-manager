import { timingSafeEqual } from 'node:crypto'
import { getConfig } from './config'

/**
 * Xác thực Bearer token cho /api/mcp.
 *
 * Spec gốc không nói tới xác thực, nhưng để endpoint tạo link mở nghĩa là bất
 * kỳ ai cũng dựng được link chuyển hướng mang tên miền của dự án — đúng thứ kẻ
 * lừa đảo cần. Domain mất uy tín và có thể bị Google gắn cờ.
 *
 * Hỗ trợ nhiều token, mỗi bên dùng một token riêng. Thu hồi được từng cái mà
 * không ảnh hưởng bên khác, và nhãn của token được ghi vào cột `created_by`
 * nên tra được link nào do bên nào tạo.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual ném lỗi khi khác độ dài — mà khác độ dài thì chắc chắn sai rồi.
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function extractToken(headers: Headers): string | null {
  const raw = headers.get('authorization') ?? ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1]!.trim() : null
}

/**
 * Trả về nhãn của token khớp, hoặc null nếu không hợp lệ.
 *
 * Luôn duyệt hết danh sách thay vì thoát sớm, để thời gian phản hồi không tiết
 * lộ token nằm ở vị trí nào.
 */
export function authenticate(headers: Headers): string | null {
  const provided = extractToken(headers)
  if (!provided) return null

  let matched: string | null = null
  for (const client of getConfig().apiClients) {
    if (constantTimeEquals(client.token, provided)) matched = client.label
  }

  return matched
}

/** Tiện ích cho chỗ chỉ cần biết hợp lệ hay không. */
export function checkBearer(headers: Headers): boolean {
  return authenticate(headers) !== null
}
