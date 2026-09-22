import { z } from 'zod'
import { ALIAS_PATTERN } from './slug'

export const MAX_TIME_WAIT = 60_000

const parameterSchema = z
  .object({
    key: z.string().min(1, 'key không được rỗng').max(128),
    value: z.string().max(4096),
  })
  .strict()

/**
 * Input của `generate_redirect_url`.
 *
 * Lưu ý: tính hợp lệ của URL KHÔNG kiểm ở đây mà ở tầng service, vì chính sách
 * URL (chặn host nội bộ, allowlist domain) phụ thuộc cấu hình runtime. Giữ một
 * chỗ duy nhất quyết định URL nào được phép — xem lib/url-guard.ts.
 */
export const generateRedirectUrlInput = z.object({
  destination_url: z.string().min(1, 'destination_url là bắt buộc').max(4096),
  title: z.string().min(1, 'title là bắt buộc').max(200),
  desc: z.string().max(500).optional(),
  alias: z
    .string()
    .regex(ALIAS_PATTERN, 'alias chỉ gồm chữ thường, số và gạch ngang ở giữa (tối đa 64 ký tự)')
    .optional(),
  time_wait: z
    .number()
    .int('time_wait phải là số nguyên')
    .min(0)
    .max(MAX_TIME_WAIT, `time_wait tối đa ${MAX_TIME_WAIT}ms`)
    .optional(),
  parameters: z.array(parameterSchema).max(50).optional(),
  forward_params: z.boolean().optional(),
}).strict()

export const getRedirectDataInput = z.object({
  alias: z.string().min(1, 'alias là bắt buộc').max(64),
  record_visit: z.boolean().optional(),
  include_stats: z.boolean().optional(),
}).strict()

/** Sửa link đã tạo. `alias` bắt buộc, các trường còn lại tuỳ chọn. */
export const updateRedirectUrlInput = z
  .object({
    alias: z.string().min(1, 'alias là bắt buộc').max(64),
    destination_url: z.string().min(1).max(4096).optional(),
    title: z.string().min(1).max(200).optional(),
    desc: z.string().max(500).nullable().optional(),
    time_wait: z
      .number()
      .int('time_wait phải là số nguyên')
      .min(0)
      .max(MAX_TIME_WAIT, `time_wait tối đa ${MAX_TIME_WAIT}ms`)
      .optional(),
    forward_params: z.boolean().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).some((k) => k !== 'alias'),
    'Phải truyền ít nhất một trường để sửa, ngoài alias',
  )

export type GenerateRedirectUrlInput = z.infer<typeof generateRedirectUrlInput>
export type GetRedirectDataInput = z.infer<typeof getRedirectDataInput>
export type UpdateRedirectUrlInput = z.infer<typeof updateRedirectUrlInput>

/**
 * JSON Schema công bố qua `tools/list` của MCP.
 *
 * Viết tay thay vì sinh tự động từ Zod: chỉ có 2 tool, schema nhỏ, và viết tay
 * thì chắc chắn client MCP nhìn thấy đúng thứ mình muốn — kèm mô tả tiếng Việt
 * cho agent hiểu. Sửa ở đây thì nhớ sửa cả schema Zod bên trên.
 */
export const GENERATE_REDIRECT_URL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    destination_url: {
      type: 'string',
      description: 'URL gốc của dự án cần chuyển hướng đến. Bắt buộc http hoặc https.',
    },
    title: {
      type: 'string',
      maxLength: 200,
      description: 'Tiêu đề hiển thị trên trang bọc, cũng dùng để phân loại dữ liệu trong GA4.',
    },
    desc: {
      type: 'string',
      maxLength: 500,
      description: 'Mô tả ngắn hiển thị trên trang bọc.',
    },
    alias: {
      type: 'string',
      maxLength: 64,
      pattern: '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$',
      description:
        'Đường dẫn URL đại diện cho dự án. Để trống thì hệ thống tự tạo slug từ title. Nếu trùng, hệ thống tự thêm hậu tố.',
    },
    time_wait: {
      type: 'integer',
      minimum: 0,
      maximum: MAX_TIME_WAIT,
      description: 'Thời gian chờ trên trang bọc trước khi chuyển hướng, tính bằng mili giây.',
    },
    parameters: {
      type: 'array',
      maxItems: 50,
      description:
        'Tham số gắn thêm vào URL trả về. Giá trị hỗ trợ placeholder {{destination_url}}, {{alias}}, {{title}}. Tham số tên "continue" được đưa vào chữ ký và dùng cho luồng dự phòng.',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', maxLength: 128 },
          value: { type: 'string', maxLength: 4096 },
        },
        required: ['key', 'value'],
        additionalProperties: false,
      },
    },
    forward_params: {
      type: 'boolean',
      default: false,
      description:
        'Có mang các tham số utm_* từ trang bọc sang URL đích hay không. Mặc định false.',
    },
  },
  required: ['destination_url', 'title'],
  additionalProperties: false,
} as const

export const GET_REDIRECT_DATA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    alias: {
      type: 'string',
      maxLength: 64,
      description: 'Alias của link cần tra cứu.',
    },
    record_visit: {
      type: 'boolean',
      default: false,
      description:
        'Có ghi nhận đây là một lượt truy cập hay không. Mặc định false để agent tra cứu mà không làm sai lệch số liệu.',
    },
    include_stats: {
      type: 'boolean',
      default: false,
      description: 'Có trả kèm thống kê lượt xem và click thật hay không.',
    },
  },
  required: ['alias'],
  additionalProperties: false,
} as const

export const UPDATE_REDIRECT_URL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    alias: {
      type: 'string',
      maxLength: 64,
      description: 'Alias của link cần sửa. Bản thân alias không đổi được.',
    },
    destination_url: {
      type: 'string',
      description:
        'URL đích mới. Lưu ý: email đã gửi mang sẵn tham số continue trỏ tới đích cũ, nhánh dự phòng của những email đó vẫn dẫn về đích cũ.',
    },
    title: { type: 'string', maxLength: 200, description: 'Tiêu đề mới.' },
    desc: {
      type: ['string', 'null'],
      maxLength: 500,
      description: 'Mô tả mới. Truyền null để xoá mô tả.',
    },
    time_wait: {
      type: 'integer',
      minimum: 0,
      maximum: MAX_TIME_WAIT,
      description: 'Thời gian chờ mới, tính bằng mili giây.',
    },
    forward_params: {
      type: 'boolean',
      description: 'Bật/tắt việc mang tham số utm_* sang URL đích.',
    },
    status: {
      type: 'string',
      enum: ['active', 'disabled'],
      description:
        'Đặt "disabled" để tắt link: trang bọc sẽ trả 404, nhưng số liệu cũ vẫn giữ nguyên.',
    },
  },
  required: ['alias'],
  additionalProperties: false,
} as const
