import { TOOLS, callTool, type ToolCallContext } from './tools'

/**
 * Lớp JSON-RPC 2.0 cho MCP, viết tay.
 *
 * Vì sao không dùng @modelcontextprotocol/sdk: route handler của Next.js App
 * Router làm việc với Request/Response chuẩn web, còn StreamableHTTPServerTransport
 * của SDK nhắm vào req/res của Node — phải viết lớp chuyển đổi ở giữa. Server này
 * chỉ có 2 tool, không session, không sampling, không resource; phần giao thức
 * cần dùng gọn trong một file. Tự viết thì kiểm soát hoàn toàn.
 *
 * Đây là biến thể stateless của Streamable HTTP: client POST một message (hoặc
 * một mảng message), server trả JSON. Không mở SSE stream.
 */

export const SERVER_NAME = 'link-wrapper-manager'
export const SERVER_VERSION = '1.0.0'

/** Mới nhất đứng đầu. Client xin bản nào có trong danh sách thì trả đúng bản đó. */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

type JsonRpcId = string | number | null

interface JsonRpcMessage {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result: value }
}

function error(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function handleMessage(
  msg: JsonRpcMessage,
  ctx: ToolCallContext,
): Promise<JsonRpcResponse | null> {
  // Thiếu id = notification: xử lý xong không trả gì.
  const isNotification = msg.id === undefined
  const id: JsonRpcId = msg.id ?? null

  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return isNotification
      ? null
      : error(id, JSON_RPC_ERRORS.INVALID_REQUEST, 'Message không đúng JSON-RPC 2.0')
  }

  const { method, params } = msg

  try {
    switch (method) {
      case 'initialize': {
        const requested = isRecord(params) ? params.protocolVersion : undefined
        const version =
          typeof requested === 'string' &&
          (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
            ? requested
            : LATEST_PROTOCOL_VERSION

        return result(id, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        })
      }

      case 'notifications/initialized':
      case 'initialized':
        return null

      case 'ping':
        return isNotification ? null : result(id, {})

      case 'tools/list':
        return result(id, { tools: TOOLS })

      case 'tools/call': {
        if (!isRecord(params) || typeof params.name !== 'string') {
          return error(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'Thiếu tham số "name"')
        }
        const toolResult = await callTool(params.name, params.arguments, ctx)
        return result(id, toolResult)
      }

      default:
        return isNotification
          ? null
          : error(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Không hỗ trợ method "${method}"`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Lỗi thật sự của server (mất kết nối DB...) — log lại để còn truy vết.
    console.error(`[mcp] ${method} thất bại:`, err)
    return isNotification ? null : error(id, JSON_RPC_ERRORS.INTERNAL_ERROR, message)
  }
}

export interface DispatchOutcome {
  /** null nghĩa là chỉ có notification — trả 202 không body. */
  body: JsonRpcResponse | JsonRpcResponse[] | null
  status: number
}

export async function dispatch(payload: unknown, ctx: ToolCallContext): Promise<DispatchOutcome> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        body: error(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Batch rỗng'),
        status: 400,
      }
    }

    const responses: JsonRpcResponse[] = []
    for (const msg of payload) {
      const res = await handleMessage(isRecord(msg) ? msg : {}, ctx)
      if (res) responses.push(res)
    }

    return responses.length > 0 ? { body: responses, status: 200 } : { body: null, status: 202 }
  }

  if (!isRecord(payload)) {
    return {
      body: error(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Body phải là object hoặc mảng JSON-RPC'),
      status: 400,
    }
  }

  const res = await handleMessage(payload, ctx)
  return res ? { body: res, status: 200 } : { body: null, status: 202 }
}
