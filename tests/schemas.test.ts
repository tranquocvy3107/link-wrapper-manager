import { describe, expect, it } from 'vitest'
import {
  MAX_TIME_WAIT,
  generateRedirectUrlInput,
  getRedirectDataInput,
} from '../lib/schemas'

describe('generate_redirect_url — input hợp lệ', () => {
  // Đúng payload trong spec.
  it('chấp nhận ví dụ đầy đủ từ spec', () => {
    const parsed = generateRedirectUrlInput.safeParse({
      destination_url: 'https://projecta.com?code=abcxyz',
      title: 'Project A',
      desc: 'Mô tả ngắn',
      alias: 'project-a',
      time_wait: 3000,
      parameters: [
        { key: 'utm_source', value: 'email' },
        { key: 'continue', value: '{{destination_url}}' },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  it('chỉ cần destination_url và title', () => {
    expect(
      generateRedirectUrlInput.safeParse({
        destination_url: 'https://projecta.com',
        title: 'Project A',
      }).success,
    ).toBe(true)
  })
})

describe('generate_redirect_url — input không hợp lệ', () => {
  it.each([
    ['thiếu destination_url', { title: 'A' }],
    ['thiếu title', { destination_url: 'https://a.com' }],
    ['title rỗng', { destination_url: 'https://a.com', title: '' }],
    ['alias có chữ hoa', { destination_url: 'https://a.com', title: 'A', alias: 'Project-A' }],
    ['alias bắt đầu bằng gạch', { destination_url: 'https://a.com', title: 'A', alias: '-a' }],
    ['alias có khoảng trắng', { destination_url: 'https://a.com', title: 'A', alias: 'a b' }],
    [
      'time_wait vượt trần',
      { destination_url: 'https://a.com', title: 'A', time_wait: MAX_TIME_WAIT + 1 },
    ],
    ['time_wait âm', { destination_url: 'https://a.com', title: 'A', time_wait: -1 }],
    ['time_wait không nguyên', { destination_url: 'https://a.com', title: 'A', time_wait: 1.5 }],
    [
      'parameter thiếu key',
      { destination_url: 'https://a.com', title: 'A', parameters: [{ value: 'x' }] },
    ],
    [
      'parameter key rỗng',
      { destination_url: 'https://a.com', title: 'A', parameters: [{ key: '', value: 'x' }] },
    ],
  ])('%s', (_label, payload) => {
    expect(generateRedirectUrlInput.safeParse(payload).success).toBe(false)
  })

  it('từ chối field lạ', () => {
    expect(
      generateRedirectUrlInput.safeParse({
        destination_url: 'https://a.com',
        title: 'A',
        khong_biet_la_gi: true,
      }).success,
    ).toBe(false)
  })
})

describe('get_redirect_data', () => {
  it('chỉ cần alias', () => {
    expect(getRedirectDataInput.safeParse({ alias: 'project-a' }).success).toBe(true)
  })

  it('nhận đủ cả ba tham số', () => {
    const parsed = getRedirectDataInput.safeParse({
      alias: 'project-a',
      record_visit: true,
      include_stats: true,
    })

    expect(parsed.success).toBe(true)
  })

  it.each([
    ['thiếu alias', {}],
    ['alias rỗng', { alias: '' }],
    ['record_visit sai kiểu', { alias: 'a', record_visit: 'có' }],
  ])('từ chối: %s', (_label, payload) => {
    expect(getRedirectDataInput.safeParse(payload).success).toBe(false)
  })
})
