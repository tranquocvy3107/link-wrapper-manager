import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Chuỗi chuẩn hoá để ký. **Chỉ một chỗ duy nhất dựng chuỗi này** — cả `sign`
 * lẫn `verify` đều gọi nó, nên không thể lệch nhau.
 *
 * Spec gốc ghi `alias + continue + expires` nối trần. Mình chèn `\n` giữa ba
 * phần vì nối trần gây nhập nhằng ranh giới: cặp (alias="a", continue="bc") và
 * (alias="ab", continue="c") cho ra cùng chuỗi "abc", tức là cùng chữ ký. Kẻ
 * tấn công kiểm soát được `continue` có thể lợi dụng chỗ đó.
 *
 * Muốn quay về đúng spec thì sửa duy nhất hàm này.
 */
export function canonicalString(
  alias: string,
  continueRaw: string | null | undefined,
  expires: number | string,
): string {
  return `${alias}\n${continueRaw ?? ''}\n${expires}`
}

export function sign(
  secret: string,
  alias: string,
  continueRaw: string | null | undefined,
  expires: number | string,
): string {
  return createHmac('sha256', secret)
    .update(canonicalString(alias, continueRaw, expires), 'utf8')
    .digest('hex')
}

export type VerifyFailure =
  | 'missing_signature'
  | 'missing_expires'
  | 'malformed_expires'
  | 'expired'
  | 'bad_signature'

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure }

export interface VerifyInput {
  secret: string
  alias: string
  continueRaw: string | null | undefined
  expires: string | null | undefined
  signature: string | null | undefined
  /** Cho phép test bơm thời gian. Mặc định là bây giờ. */
  nowSeconds?: number
}

export function verify(input: VerifyInput): VerifyResult {
  const { secret, alias, continueRaw, expires, signature } = input

  if (!signature) return { ok: false, reason: 'missing_signature' }
  if (!expires) return { ok: false, reason: 'missing_expires' }

  const expiresNum = Number(expires)
  if (!Number.isInteger(expiresNum) || expiresNum <= 0) {
    return { ok: false, reason: 'malformed_expires' }
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (expiresNum < now) return { ok: false, reason: 'expired' }

  const expected = sign(secret, alias, continueRaw, expires)

  // So sánh hằng thời gian. timingSafeEqual ném lỗi nếu hai buffer khác độ dài,
  // nên phải chặn trước — và chênh độ dài thì chắc chắn đã sai rồi.
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return { ok: false, reason: 'bad_signature' }
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }

  return { ok: true }
}

/** Mốc hết hạn cho một chữ ký mới, tính bằng unix seconds. */
export function expiresAt(ttlSeconds: number, nowSeconds?: number): number {
  return (nowSeconds ?? Math.floor(Date.now() / 1000)) + ttlSeconds
}
