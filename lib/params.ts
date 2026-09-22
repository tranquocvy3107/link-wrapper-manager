export interface LinkParameter {
  key: string
  value: string
}

export interface TemplateContext {
  destination_url: string
  alias: string
  title: string
}

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi

/**
 * Thay các placeholder dạng `{{destination_url}}` trong giá trị tham số.
 *
 * Placeholder không nhận ra thì giữ nguyên, không ném lỗi — agent có thể cố ý
 * truyền chuỗi chứa dấu ngoặc nhọn.
 */
export function resolveTemplate(value: string, ctx: TemplateContext): string {
  return value.replace(PLACEHOLDER, (match, name: string) => {
    const key = name.toLowerCase() as keyof TemplateContext
    return key in ctx ? ctx[key] : match
  })
}

export function resolveParameters(
  params: readonly LinkParameter[],
  ctx: TemplateContext,
): LinkParameter[] {
  return params.map((p) => ({ key: p.key, value: resolveTemplate(p.value, ctx) }))
}

/**
 * Dựng query string. Mỗi key và value đều được encode.
 *
 * Dùng URLSearchParams để encode đúng chuẩn — ví dụ `continue` chứa URL đầy đủ
 * sẽ thành `continue=https%3A%2F%2Fprojecta.com%3Fcode%3Dabcxyz` như trong spec.
 */
export function buildQueryString(pairs: readonly LinkParameter[]): string {
  const sp = new URLSearchParams()
  for (const { key, value } of pairs) {
    if (!key) continue
    sp.append(key, value)
  }
  return sp.toString()
}

/** Lấy giá trị tham số `continue` — thứ được đem đi ký. */
export function findContinueValue(params: readonly LinkParameter[]): string {
  return params.find((p) => p.key === 'continue')?.value ?? ''
}

/**
 * Bảo đảm URL luôn mang tham số `continue`.
 *
 * `continue` là thứ nuôi nhánh dự phòng: khi tra alias không ra, trang bọc kiểm
 * chữ ký rồi chuyển thẳng người dùng tới giá trị này. Nếu để người gọi tự nhớ
 * truyền vào thì lưới an toàn chỉ hoạt động cho những link mà họ nhớ — mà một
 * lưới an toàn hoạt động tuỳ lúc thì không phải lưới an toàn.
 *
 * Người gọi truyền `continue` tường minh thì tôn trọng giá trị của họ.
 */
export function ensureContinueParam(
  params: readonly LinkParameter[],
  destinationUrl: string,
): LinkParameter[] {
  if (params.some((p) => p.key === 'continue')) return [...params]
  return [...params, { key: 'continue', value: destinationUrl }]
}

/**
 * Ghép query `utm_*` của trang bọc vào URL đích.
 * Chỉ dùng khi link bật `forward_params`. Tham số nội bộ của hệ thống
 * (expires, signature, continue) không bao giờ được chuyển tiếp.
 */
const INTERNAL_PARAMS = new Set(['expires', 'signature', 'continue'])

export function mergeForwardedParams(
  destinationUrl: string,
  incoming: Record<string, string | string[] | undefined>,
): string {
  let url: URL
  try {
    url = new URL(destinationUrl)
  } catch {
    return destinationUrl
  }

  for (const [key, raw] of Object.entries(incoming)) {
    if (INTERNAL_PARAMS.has(key) || raw === undefined) continue
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value === undefined) continue
    // Không ghi đè tham số đã có sẵn trong URL đích.
    if (url.searchParams.has(key)) continue
    url.searchParams.set(key, value)
  }

  return url.toString()
}
