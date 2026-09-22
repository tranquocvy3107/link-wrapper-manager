/**
 * Kiểm tra URL đích trước khi cho phép chuyển hướng tới đó.
 *
 * Đây là lớp bảo vệ chống open-redirect. Không có nó, tham số `continue` biến
 * hệ thống thành công cụ chuyển hướng tuỳ ý mang tên miền của dự án — chính xác
 * thứ kẻ lừa đảo cần.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/** Host nội bộ: chặn để không dùng hệ thống này làm bàn đạp dò mạng nội bộ (SSRF). */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
])

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal']

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false

  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a > 255 || b > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return false

  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8
  if (a === 0) return true // 0.0.0.0/8
  if (a === 169 && b === 254) return true // 169.254.0.0/16 — link-local, metadata cloud
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  return false
}

export type UrlRejection =
  | 'empty'
  | 'malformed'
  | 'bad_protocol'
  | 'internal_host'
  | 'not_allowlisted'

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRejection }

export interface UrlGuardOptions {
  /** Mảng rỗng = cho phép mọi host public. */
  allowedHosts?: string[]
}

export function checkUrl(raw: string | null | undefined, opts: UrlGuardOptions = {}): UrlCheck {
  if (!raw || !raw.trim()) return { ok: false, reason: 'empty' }

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  // Chặn javascript:, data:, vbscript:, file: ... — chỉ http/https đi qua.
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: 'bad_protocol' }
  }

  const hostname = url.hostname.toLowerCase()
  if (!hostname) return { ok: false, reason: 'malformed' }

  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, reason: 'internal_host' }
  if (BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, reason: 'internal_host' }
  }
  if (isPrivateIpv4(hostname)) return { ok: false, reason: 'internal_host' }
  // IPv6 dạng [....] — chặn loopback và unique-local fc00::/7
  if (hostname.startsWith('[')) {
    const inner = hostname.slice(1, -1)
    if (inner === '::1' || /^f[cd][0-9a-f]{2}:/.test(inner)) {
      return { ok: false, reason: 'internal_host' }
    }
  }

  const allowed = opts.allowedHosts ?? []
  if (allowed.length > 0 && !allowed.includes(hostname)) {
    return { ok: false, reason: 'not_allowlisted' }
  }

  return { ok: true, url }
}

/** Tiện ích cho chỗ chỉ cần biết hợp lệ hay không. */
export function isSafeUrl(raw: string | null | undefined, opts: UrlGuardOptions = {}): boolean {
  return checkUrl(raw, opts).ok
}
