import { describe, expect, it } from 'vitest'
import { ALIAS_MAX_LENGTH, aliasCandidate, isValidAlias, slugify } from '../lib/slug'

describe('slugify', () => {
  it.each([
    ['Project A', 'project-a'],
    ['Dự án Á Đông', 'du-an-a-dong'],
    ['Đầu tư Chứng khoán 2026', 'dau-tu-chung-khoan-2026'],
    ['Ưu đãi tháng 9 — Giảm 50%', 'uu-dai-thang-9-giam-50'],
    ['  nhiều   khoảng   trắng  ', 'nhieu-khoang-trang'],
    ['---đầu-và-cuối---', 'dau-va-cuoi'],
    ['MIXED Case TITLE', 'mixed-case-title'],
    ['a/b?c=d&e', 'a-b-c-d-e'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  // đ không phân rã bằng NFD nên phải thay tay — đây là cái bẫy dễ bỏ sót nhất.
  it('xử lý được chữ đ hoa và thường', () => {
    expect(slugify('đ Đ')).toBe('d-d')
    expect(slugify('Đường dẫn')).toBe('duong-dan')
  })

  it('chuỗi không có ký tự Latin nào thì trả về rỗng', () => {
    expect(slugify('日本語')).toBe('')
    expect(slugify('!!! ??? ***')).toBe('')
  })

  it('cắt đúng độ dài tối đa và không để lại gạch ngang cuối', () => {
    const slug = slugify('a'.repeat(200))
    expect(slug).toHaveLength(ALIAS_MAX_LENGTH)

    const risky = slugify(`${'a'.repeat(ALIAS_MAX_LENGTH - 1)} bbb`)
    expect(risky.endsWith('-')).toBe(false)
  })

  it('kết quả luôn là alias hợp lệ', () => {
    for (const input of ['Dự án Á Đông', 'Project A', 'Ưu đãi tháng 9 — Giảm 50%']) {
      expect(isValidAlias(slugify(input))).toBe(true)
    }
  })
})

describe('isValidAlias', () => {
  it.each(['project-a', 'a', 'a1', 'du-an-2026'])('chấp nhận %s', (alias) => {
    expect(isValidAlias(alias)).toBe(true)
  })

  it.each(['-leading', 'trailing-', 'Có-Hoa', 'có_gạch_dưới', 'khoảng trắng', '', 'a'.repeat(65)])(
    'từ chối %s',
    (alias) => {
      expect(isValidAlias(alias)).toBe(false)
    },
  )
})

describe('aliasCandidate', () => {
  it('lần đầu giữ nguyên, các lần sau thêm hậu tố', () => {
    expect(aliasCandidate('project-a', 0)).toBe('project-a')
    expect(aliasCandidate('project-a', 1)).toBe('project-a-2')
    expect(aliasCandidate('project-a', 2)).toBe('project-a-3')
  })

  it('cắt phần gốc để tổng độ dài không vượt giới hạn', () => {
    const long = 'a'.repeat(ALIAS_MAX_LENGTH)
    const candidate = aliasCandidate(long, 1)

    expect(candidate.length).toBeLessThanOrEqual(ALIAS_MAX_LENGTH)
    expect(candidate.endsWith('-2')).toBe(true)
    expect(isValidAlias(candidate)).toBe(true)
  })
})
