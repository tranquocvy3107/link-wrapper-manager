import { describe, expect, it } from 'vitest'
import { checkUrl } from '../lib/url-guard'

/**
 * Chống lừa bằng cách viết IPv4 khác thường.
 *
 * Bối cảnh: advisory Node.js tháng 10/2026 (CVE-2026-106069, CVE-2026-106072)
 * nói về đúng lớp vấn đề này — `0177.0.0.1`, `0x7f.0.0.1`, `2130706433`,
 * `127.1` đều trỏ về loopback nhưng trông không giống `127.0.0.1`.
 *
 * `url-guard` chặn IP nội bộ bằng biểu thức chính quy trên `url.hostname`.
 * Nếu bộ phân tích URL không chuẩn hoá mấy dạng này thì biểu thức sẽ trượt,
 * và hệ thống thành bàn đạp dò mạng nội bộ của Render.
 *
 * Đây là bề mặt tấn công thật: `destination_url` do agent truyền vào, và
 * `continue` nằm ngay trên URL công khai.
 */

const LOOPBACK_CACH_VIET_KHAC = [
  ['bát phân', 'http://0177.0.0.1'],
  ['thập lục phân', 'http://0x7f.0.0.1'],
  ['số nguyên thập phân', 'http://2130706433'],
  ['dạng rút gọn', 'http://127.1'],
  ['dạng rút gọn 2 phần', 'http://127.0.1'],
  ['thập lục phân nguyên khối', 'http://0x7f000001'],
] as const

describe('url-guard — IPv4 viết kiểu lạ trỏ về loopback', () => {
  it.each(LOOPBACK_CACH_VIET_KHAC)('chặn %s: %s', (_nhan, url) => {
    const res = checkUrl(url)
    expect(res.ok, `${url} lọt qua được lớp chặn`).toBe(false)
  })
})

describe('url-guard — IPv4 viết kiểu lạ trỏ về mạng nội bộ khác', () => {
  it.each([
    ['169.254 bát phân', 'http://0251.0376.0251.0376'],
    ['10.x thập phân', 'http://167772161'],
    ['192.168 rút gọn', 'http://192.168.1'],
  ])('chặn %s: %s', (_nhan, url) => {
    const res = checkUrl(url)
    expect(res.ok, `${url} lọt qua được lớp chặn`).toBe(false)
  })
})

describe('url-guard — host công khai vẫn phải đi qua được', () => {
  it.each([
    'https://projecta.com',
    'http://8.8.8.8',
    'http://1.1.1.1',
    'https://my.racknerd.com/aff.php?aff=17539',
  ])('cho qua %s', (url) => {
    expect(checkUrl(url).ok).toBe(true)
  })
})
