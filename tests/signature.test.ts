import { describe, expect, it } from 'vitest'
import { canonicalString, expiresAt, sign, verify } from '../lib/signature'

const SECRET = 'a'.repeat(64)
const NOW = 1_790_000_000

describe('signature', () => {
  it('ký rồi kiểm lại thì hợp lệ', () => {
    const expires = NOW + 600
    const sig = sign(SECRET, 'project-a', 'https://projecta.com?code=abcxyz', expires)

    expect(
      verify({
        secret: SECRET,
        alias: 'project-a',
        continueRaw: 'https://projecta.com?code=abcxyz',
        expires: String(expires),
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it('không có continue vẫn ký và kiểm được', () => {
    const expires = NOW + 600
    const sig = sign(SECRET, 'project-a', null, expires)

    expect(
      verify({
        secret: SECRET,
        alias: 'project-a',
        continueRaw: null,
        expires: String(expires),
        signature: sig,
        nowSeconds: NOW,
      }).ok,
    ).toBe(true)
  })

  it.each([
    ['alias', { alias: 'project-b' }],
    ['continue', { continueRaw: 'https://evil.com' }],
    ['expires', { expires: String(NOW + 601) }],
  ])('đổi %s thì chữ ký không còn hợp lệ', (_label, override) => {
    const expires = NOW + 600
    const sig = sign(SECRET, 'project-a', 'https://projecta.com', expires)

    const res = verify({
      secret: SECRET,
      alias: 'project-a',
      continueRaw: 'https://projecta.com',
      expires: String(expires),
      signature: sig,
      nowSeconds: NOW,
      ...override,
    })

    expect(res.ok).toBe(false)
  })

  it('sửa một ký tự trong chữ ký thì bị từ chối', () => {
    const expires = NOW + 600
    const sig = sign(SECRET, 'project-a', 'https://projecta.com', expires)
    const tampered = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)

    expect(
      verify({
        secret: SECRET,
        alias: 'project-a',
        continueRaw: 'https://projecta.com',
        expires: String(expires),
        signature: tampered,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('chữ ký hết hạn thì bị từ chối', () => {
    const expires = NOW - 1
    const sig = sign(SECRET, 'project-a', 'https://projecta.com', expires)

    expect(
      verify({
        secret: SECRET,
        alias: 'project-a',
        continueRaw: 'https://projecta.com',
        expires: String(expires),
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it.each([
    ['thiếu chữ ký', { signature: null }, 'missing_signature'],
    ['thiếu expires', { expires: null }, 'missing_expires'],
    ['expires không phải số', { expires: 'không-phải-số' }, 'malformed_expires'],
  ])('%s → %s', (_label, override, reason) => {
    const res = verify({
      secret: SECRET,
      alias: 'project-a',
      continueRaw: '',
      expires: String(NOW + 600),
      signature: 'x'.repeat(64),
      nowSeconds: NOW,
      ...override,
    })

    expect(res).toEqual({ ok: false, reason })
  })

  // Đây là lý do chuỗi chuẩn hoá có dấu phân cách thay vì nối trần như spec gốc.
  it('không nhập nhằng ranh giới giữa alias và continue', () => {
    expect(canonicalString('a', 'bc', 1)).not.toBe(canonicalString('ab', 'c', 1))

    const sigA = sign(SECRET, 'a', 'bc', NOW)
    const sigB = sign(SECRET, 'ab', 'c', NOW)
    expect(sigA).not.toBe(sigB)
  })

  it('expiresAt cộng đúng TTL', () => {
    expect(expiresAt(2_592_000, NOW)).toBe(NOW + 2_592_000)
  })
})
