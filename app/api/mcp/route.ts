import { checkBearer, tokenLabel } from '@/lib/auth'
import { JSON_RPC_ERRORS, dispatch } from '@/lib/mcp/jsonrpc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function unauthorized() {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST,
        message: 'Thiếu hoặc sai Bearer token. Gửi header: Authorization: Bearer <MCP_API_TOKEN>',
      },
    }),
    {
      status: 401,
      headers: { ...JSON_HEADERS, 'WWW-Authenticate': 'Bearer' },
    },
  )
}

export async function POST(request: Request) {
  if (!checkBearer(request.headers)) return unauthorized()

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: 'Body không phải JSON hợp lệ' },
      }),
      { status: 400, headers: JSON_HEADERS },
    )
  }

  const { body, status } = await dispatch(payload, {
    createdBy: tokenLabel(request.headers),
    headers: request.headers,
  })

  // Chỉ có notification trong batch — đúng chuẩn là 202 không body.
  if (body === null) return new Response(null, { status })

  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * Streamable HTTP cho phép client mở SSE stream bằng GET. Server này stateless,
 * không đẩy gì ra ngoài luồng request nên từ chối thẳng — đúng như spec cho
 * server không hỗ trợ stream.
 */
export async function GET() {
  return new Response(
    JSON.stringify({ error: 'Server này không hỗ trợ SSE stream. Dùng POST.' }),
    { status: 405, headers: { ...JSON_HEADERS, Allow: 'POST' } },
  )
}

export async function DELETE() {
  return new Response(
    JSON.stringify({ error: 'Server này stateless, không có session để huỷ.' }),
    { status: 405, headers: { ...JSON_HEADERS, Allow: 'POST' } },
  )
}
