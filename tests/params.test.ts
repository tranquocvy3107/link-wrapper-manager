import { describe, expect, it } from 'vitest'
import {
  buildQueryString,
  ensureContinueParam,
  findContinueValue,
  mergeForwardedParams,
  resolveParameters,
  resolveTemplate,
} from '../lib/params'

const CTX = {
  destination_url: 'https://projecta.com?code=abcxyz',
  alias: 'project-a',
  title: 'Project A',
}

describe('resolveTemplate', () => {
  it('thay placeholder đã biết', () => {
    expect(resolveTemplate('{{destination_url}}', CTX)).toBe('https://projecta.com?code=abcxyz')
    expect(resolveTemplate('{{alias}}', CTX)).toBe('project-a')
    expect(resolveTemplate('{{title}}', CTX)).toBe('Project A')
  })

  it('chấp nhận khoảng trắng và chữ hoa trong placeholder', () => {
    expect(resolveTemplate('{{ destination_url }}', CTX)).toBe(CTX.destination_url)
    expect(resolveTemplate('{{DESTINATION_URL}}', CTX)).toBe(CTX.destination_url)
  })

  it('giữ nguyên placeholder không nhận ra, không ném lỗi', () => {
    expect(resolveTemplate('{{khong_ton_tai}}', CTX)).toBe('{{khong_ton_tai}}')
    expect(resolveTemplate('giá {{abc}} và {{alias}}', CTX)).toBe('giá {{abc}} và project-a')
  })

  it('chuỗi không có placeholder giữ nguyên', () => {
    expect(resolveTemplate('email', CTX)).toBe('email')
    expect(resolveTemplate('', CTX)).toBe('')
  })
})

describe('buildQueryString', () => {
  // Đây chính là ví dụ trong spec — encode phải khớp từng ký tự.
  it('dựng đúng query string như ví dụ trong spec', () => {
    const resolved = resolveParameters(
      [
        { key: 'utm_source', value: 'email' },
        { key: 'continue', value: '{{destination_url}}' },
      ],
      CTX,
    )

    expect(buildQueryString(resolved)).toBe(
      'utm_source=email&continue=https%3A%2F%2Fprojecta.com%3Fcode%3Dabcxyz',
    )
  })

  it('bỏ qua tham số có key rỗng', () => {
    expect(buildQueryString([{ key: '', value: 'x' }, { key: 'a', value: 'b' }])).toBe('a=b')
  })

  it('mảng rỗng cho chuỗi rỗng', () => {
    expect(buildQueryString([])).toBe('')
  })
})

describe('findContinueValue', () => {
  it('tìm được giá trị continue', () => {
    expect(
      findContinueValue([
        { key: 'utm_source', value: 'email' },
        { key: 'continue', value: 'https://projecta.com' },
      ]),
    ).toBe('https://projecta.com')
  })

  it('không có continue thì trả chuỗi rỗng', () => {
    expect(findContinueValue([{ key: 'utm_source', value: 'email' }])).toBe('')
  })
})

describe('mergeForwardedParams', () => {
  it('ghép tham số utm vào URL đích', () => {
    const merged = mergeForwardedParams('https://projecta.com/landing', {
      utm_source: 'email',
      utm_campaign: 'q4',
    })

    const url = new URL(merged)
    expect(url.searchParams.get('utm_source')).toBe('email')
    expect(url.searchParams.get('utm_campaign')).toBe('q4')
  })

  it('không bao giờ chuyển tiếp tham số nội bộ của hệ thống', () => {
    const merged = mergeForwardedParams('https://projecta.com/', {
      expires: '123',
      signature: 'deadbeef',
      continue: 'https://evil.com',
      utm_source: 'email',
    })

    const url = new URL(merged)
    expect(url.searchParams.get('expires')).toBeNull()
    expect(url.searchParams.get('signature')).toBeNull()
    expect(url.searchParams.get('continue')).toBeNull()
    expect(url.searchParams.get('utm_source')).toBe('email')
  })

  it('không ghi đè tham số đã có sẵn trong URL đích', () => {
    const merged = mergeForwardedParams('https://projecta.com/?utm_source=goc', {
      utm_source: 'email',
    })

    expect(new URL(merged).searchParams.get('utm_source')).toBe('goc')
  })

  it('URL đích hỏng thì trả nguyên chuỗi, không ném lỗi', () => {
    expect(mergeForwardedParams('không-phải-url', { utm_source: 'email' })).toBe('không-phải-url')
  })
})

describe('ensureContinueParam', () => {
  // Lý do tồn tại: người dùng chỉ nói "tạo link tới trang này", agent gọi tool
  // với đúng hai tham số bắt buộc. Không tự thêm continue thì link đó mất luôn
  // nhánh dự phòng — mà lưới an toàn chạy tuỳ lúc thì không phải lưới an toàn.
  it('tự thêm continue khi người gọi không truyền', () => {
    expect(ensureContinueParam([], 'https://projecta.com')).toEqual([
      { key: 'continue', value: 'https://projecta.com' },
    ])
  })

  it('giữ nguyên thứ tự và thêm continue vào cuối', () => {
    expect(
      ensureContinueParam([{ key: 'utm_source', value: 'email' }], 'https://projecta.com'),
    ).toEqual([
      { key: 'utm_source', value: 'email' },
      { key: 'continue', value: 'https://projecta.com' },
    ])
  })

  it('tôn trọng continue mà người gọi truyền tường minh', () => {
    const given = [{ key: 'continue', value: 'https://khac.com' }]
    expect(ensureContinueParam(given, 'https://projecta.com')).toEqual(given)
  })

  it('không sửa mảng gốc', () => {
    const original = [{ key: 'utm_source', value: 'email' }]
    ensureContinueParam(original, 'https://projecta.com')
    expect(original).toHaveLength(1)
  })

  it('link tối giản vẫn ký được vì luôn có continue', () => {
    const params = ensureContinueParam([], 'https://projecta.com?code=abcxyz')
    expect(findContinueValue(params)).toBe('https://projecta.com?code=abcxyz')
  })
})
