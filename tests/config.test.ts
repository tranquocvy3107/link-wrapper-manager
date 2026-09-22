import { describe, expect, it } from 'vitest'
import { parseApiClients } from '../lib/config'

const A = 'a'.repeat(32)
const B = 'b'.repeat(32)
const C = 'c'.repeat(32)

describe('parseApiClients', () => {
  it('một token trần thì nhãn là default', () => {
    expect(parseApiClients(A, '')).toEqual([{ label: 'default', token: A }])
  })

  it('tách được nhiều token có nhãn', () => {
    expect(parseApiClients('', `marketing:${A},sales:${B}`)).toEqual([
      { label: 'marketing', token: A },
      { label: 'sales', token: B },
    ])
  })

  it('bỏ qua khoảng trắng thừa quanh nhãn và token', () => {
    expect(parseApiClients('', `  marketing : ${A} ,  sales:${B}  `)).toEqual([
      { label: 'marketing', token: A },
      { label: 'sales', token: B },
    ])
  })

  it('gộp được cả MCP_API_TOKEN lẫn MCP_API_TOKENS', () => {
    expect(parseApiClients(C, `marketing:${A}`)).toEqual([
      { label: 'marketing', token: A },
      { label: 'default', token: C },
    ])
  })

  // Token có thể chứa dấu hai chấm, chỉ tách ở dấu ĐẦU TIÊN.
  it('token chứa dấu hai chấm vẫn tách đúng', () => {
    const weird = `${A}:phan:sau`
    expect(parseApiClients('', `marketing:${weird}`)).toEqual([
      { label: 'marketing', token: weird },
    ])
  })

  it('mục không có nhãn thì lấy nhãn default', () => {
    expect(parseApiClients('', A)).toEqual([{ label: 'default', token: A }])
  })

  it('bỏ token trùng, giữ lần xuất hiện đầu', () => {
    expect(parseApiClients(A, `marketing:${A}`)).toEqual([{ label: 'marketing', token: A }])
  })

  it('bỏ qua mục rỗng và dấu phẩy thừa', () => {
    expect(parseApiClients('', `,,marketing:${A},,`)).toEqual([{ label: 'marketing', token: A }])
  })

  it('không có token nào thì ném lỗi', () => {
    expect(() => parseApiClients('', '')).toThrow(/ít nhất một token/)
    expect(() => parseApiClients('', '   ')).toThrow(/ít nhất một token/)
  })

  it('token quá ngắn thì ném lỗi và nêu đúng nhãn', () => {
    expect(() => parseApiClients('', 'marketing:qua-ngan')).toThrow(/marketing/)
    expect(() => parseApiClients('ngan', '')).toThrow(/quá ngắn/)
  })
})
