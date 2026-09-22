import { describe, expect, it } from 'vitest'
import { checkUrl, isSafeUrl } from '../lib/url-guard'

describe('url-guard — chấp nhận', () => {
  it.each([
    'https://projecta.com',
    'https://projecta.com?code=abcxyz',
    'http://example.org/path?a=1#frag',
    'https://sub.domain.co.uk/a/b/c',
    'https://example.com:8443/x',
  ])('%s', (url) => {
    expect(isSafeUrl(url)).toBe(true)
  })
})

describe('url-guard — chặn scheme nguy hiểm', () => {
  it.each([
    ['javascript:alert(1)', 'bad_protocol'],
    ['JavaScript:alert(1)', 'bad_protocol'],
    ['data:text/html,<script>alert(1)</script>', 'bad_protocol'],
    ['vbscript:msgbox(1)', 'bad_protocol'],
    ['file:///etc/passwd', 'bad_protocol'],
    ['ftp://example.com', 'bad_protocol'],
  ])('%s → %s', (url, reason) => {
    const res = checkUrl(url)
    expect(res).toEqual({ ok: false, reason })
  })
})

describe('url-guard — chặn host nội bộ (chống SSRF)', () => {
  it.each([
    'http://localhost',
    'http://localhost:3000/x',
    'http://127.0.0.1',
    'http://127.99.12.3',
    'http://0.0.0.0',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/x',
    'http://myserver.local',
    'http://api.internal',
    'http://[::1]/',
  ])('%s', (url) => {
    expect(checkUrl(url)).toEqual({ ok: false, reason: 'internal_host' })
  })

  it('IP riêng nằm ngoài dải riêng vẫn được phép', () => {
    expect(isSafeUrl('http://172.32.0.1')).toBe(true)
    expect(isSafeUrl('http://8.8.8.8')).toBe(true)
  })
})

describe('url-guard — đầu vào hỏng', () => {
  it.each([
    [null, 'empty'],
    [undefined, 'empty'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['không-phải-url', 'malformed'],
    ['://thiếu-scheme', 'malformed'],
  ])('%s → %s', (url, reason) => {
    expect(checkUrl(url as string | null | undefined)).toEqual({ ok: false, reason })
  })
})

describe('url-guard — allowlist', () => {
  const allowedHosts = ['projecta.com', 'www.projecta.com']

  it('cho qua host nằm trong danh sách', () => {
    expect(isSafeUrl('https://projecta.com/x', { allowedHosts })).toBe(true)
    expect(isSafeUrl('https://www.projecta.com/x', { allowedHosts })).toBe(true)
  })

  it('chặn host ngoài danh sách', () => {
    expect(checkUrl('https://evil.com', { allowedHosts })).toEqual({
      ok: false,
      reason: 'not_allowlisted',
    })
  })

  it('danh sách rỗng nghĩa là cho phép mọi host public', () => {
    expect(isSafeUrl('https://evil.com', { allowedHosts: [] })).toBe(true)
  })

  it('so khớp không phân biệt hoa thường', () => {
    expect(isSafeUrl('https://PROJECTA.com/x', { allowedHosts })).toBe(true)
  })
})
