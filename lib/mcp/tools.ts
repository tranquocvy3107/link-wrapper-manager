import {
  GENERATE_REDIRECT_URL_JSON_SCHEMA,
  GET_REDIRECT_DATA_JSON_SCHEMA,
  UPDATE_REDIRECT_URL_JSON_SCHEMA,
  generateRedirectUrlInput,
  getRedirectDataInput,
  updateRedirectUrlInput,
} from '../schemas'
import {
  ServiceError,
  createLink,
  getLinkByAlias,
  getStats,
  recordVisit,
  updateLink,
} from '../links.service'

export interface ToolDescriptor {
  name: string
  title: string
  description: string
  inputSchema: unknown
}

export const TOOLS: ToolDescriptor[] = [
  {
    name: 'generate_redirect_url',
    title: 'Tạo URL chuyển hướng',
    description:
      'Tạo một link bọc trỏ tới URL đích. Trả về URL đầy đủ kèm chữ ký để gắn vào email. ' +
      'Alias để trống thì hệ thống tự sinh từ title và tự xử lý trùng lặp.',
    inputSchema: GENERATE_REDIRECT_URL_JSON_SCHEMA,
  },
  {
    name: 'get_redirect_data',
    title: 'Đọc cấu hình link',
    description:
      'Đọc cấu hình của một link theo alias, kèm tuỳ chọn thống kê lượt xem và click thật. ' +
      'Mặc định KHÔNG ghi nhận lượt truy cập, để tra cứu không làm sai lệch số liệu.',
    inputSchema: GET_REDIRECT_DATA_JSON_SCHEMA,
  },
  {
    name: 'update_redirect_url',
    title: 'Sửa link đã tạo',
    description:
      'Sửa cấu hình của một link đã tồn tại: tiêu đề, mô tả, URL đích, thời gian chờ, ' +
      'hoặc tắt link. Alias không đổi được, nên mọi URL đã gửi trong email vẫn dùng tiếp.',
    inputSchema: UPDATE_REDIRECT_URL_JSON_SCHEMA,
  },
]

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function fail(message: string, code?: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, code }, null, 2) }],
    isError: true,
  }
}

export interface ToolCallContext {
  createdBy?: string
  headers?: Headers
}

export async function callTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolCallContext = {},
): Promise<ToolResult> {
  switch (name) {
    case 'generate_redirect_url':
      return handleGenerate(rawArgs, ctx)
    case 'get_redirect_data':
      return handleGetData(rawArgs, ctx)
    case 'update_redirect_url':
      return handleUpdate(rawArgs)
    default:
      return fail(`Không có tool tên "${name}"`, 'unknown_tool')
  }
}

async function handleGenerate(rawArgs: unknown, ctx: ToolCallContext): Promise<ToolResult> {
  const parsed = generateRedirectUrlInput.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`)
    return fail(`Tham số không hợp lệ:\n${details.join('\n')}`, 'invalid_params')
  }

  try {
    const result = await createLink(parsed.data, { createdBy: ctx.createdBy })
    return ok({
      url: result.url,
      alias: result.alias,
      link_id: result.linkId,
      expires: result.expires,
      expires_at_iso: new Date(result.expires * 1000).toISOString(),
    })
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message, err.code)
    throw err
  }
}

async function handleGetData(rawArgs: unknown, ctx: ToolCallContext): Promise<ToolResult> {
  const parsed = getRedirectDataInput.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`)
    return fail(`Tham số không hợp lệ:\n${details.join('\n')}`, 'invalid_params')
  }

  const { alias, record_visit, include_stats } = parsed.data
  const link = await getLinkByAlias(alias)

  // Không tìm thấy KHÔNG phải lỗi: trang bọc dựa vào kết quả này để chuyển sang
  // nhánh dự phòng bằng chữ ký.
  if (!link) {
    return ok({ found: false, alias })
  }

  if (record_visit && ctx.headers) {
    await recordVisit({ link, headers: ctx.headers })
  }

  const payload: Record<string, unknown> = {
    found: true,
    alias: link.alias,
    destination_url: link.destinationUrl,
    title: link.title,
    desc: link.description,
    time_wait: link.timeWait,
    parameters: link.parameters,
    forward_params: link.forwardParams,
    status: link.status,
    created_at: link.createdAt.toISOString(),
  }

  if (include_stats) {
    payload.stats = await getStats(link.id)
  }

  return ok(payload)
}

async function handleUpdate(rawArgs: unknown): Promise<ToolResult> {
  const parsed = updateRedirectUrlInput.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`)
    return fail(`Tham số không hợp lệ:\n${details.join('\n')}`, 'invalid_params')
  }

  try {
    const link = await updateLink(parsed.data)
    if (!link) {
      return fail(`Không tìm thấy link có alias "${parsed.data.alias}".`, 'not_found')
    }

    return ok({
      updated: true,
      alias: link.alias,
      destination_url: link.destinationUrl,
      title: link.title,
      desc: link.description,
      time_wait: link.timeWait,
      forward_params: link.forwardParams,
      status: link.status,
      updated_at: link.updatedAt.toISOString(),
    })
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message, err.code)
    throw err
  }
}
