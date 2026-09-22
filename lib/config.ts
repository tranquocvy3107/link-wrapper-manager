import { z } from 'zod'

/**
 * Cấu hình đọc từ biến môi trường.
 *
 * Validate theo kiểu lazy (lần đầu gọi `getConfig()`) chứ không phải lúc import.
 * Lý do: `next build` cũng import module này, mà lúc build thì chưa có
 * DATABASE_URL thật — validate sớm sẽ làm hỏng build.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL là bắt buộc'),
  DATABASE_SSL: z.string().default('false'),

  LINK_SIGNING_SECRET: z
    .string()
    .min(32, 'LINK_SIGNING_SECRET phải dài ít nhất 32 ký tự (dùng: openssl rand -hex 32)'),
  IP_SALT: z.string().min(16, 'IP_SALT phải dài ít nhất 16 ký tự'),

  // Hai cách khai báo token, dùng cái nào cũng được (khai cả hai thì gộp lại):
  //   MCP_API_TOKEN  = <token>                    — một token duy nhất, nhãn "default"
  //   MCP_API_TOKENS = nhãn:token,nhãn:token      — mỗi bên dùng một token riêng
  // Nhiều token để thu hồi được từng cái mà không ảnh hưởng bên khác, và nhãn
  // được ghi vào cột created_by nên tra được link nào do ai tạo.
  MCP_API_TOKEN: z.string().default(''),
  MCP_API_TOKENS: z.string().default(''),

  PUBLIC_BASE_URL: z.string().min(1, 'PUBLIC_BASE_URL là bắt buộc'),
  SIGNATURE_TTL: z.string().default('2592000'),
  DEFAULT_TIME_WAIT: z.string().default('3000'),

  GA4_ID: z.string().default(''),
  ALLOWED_DESTINATION_HOSTS: z.string().default(''),
})

export interface ApiClient {
  /** Nhãn ghi vào cột `created_by`, ví dụ "marketing". */
  label: string
  token: string
}

export interface AppConfig {
  databaseUrl: string
  databaseSsl: boolean
  linkSigningSecret: string
  ipSalt: string
  /** Luôn có ít nhất một phần tử. */
  apiClients: ApiClient[]
  /** Không có dấu `/` ở cuối. */
  publicBaseUrl: string
  /** Giây. */
  signatureTtl: number
  /** Mili giây. */
  defaultTimeWait: number
  /** Chuỗi rỗng nghĩa là không nhúng GA4. */
  ga4Id: string
  /** Mảng rỗng nghĩa là cho phép mọi host public. */
  allowedDestinationHosts: string[]
}

function toBool(raw: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function toPositiveInt(raw: string, fallback: number, field: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${field} phải là số nguyên không âm, nhận được: ${raw}`)
  }
  return Number.isFinite(n) ? n : fallback
}

const MIN_TOKEN_LENGTH = 16

/**
 * Gộp `MCP_API_TOKEN` và `MCP_API_TOKENS` thành một danh sách.
 *
 * Mỗi mục trong `MCP_API_TOKENS` có dạng `nhãn:token`. Token có thể chứa dấu
 * hai chấm nên chỉ tách ở dấu đầu tiên. Mục không có dấu hai chấm được coi là
 * token trần, nhãn `default`.
 */
export function parseApiClients(single: string, multi: string): ApiClient[] {
  const clients: ApiClient[] = []
  const seen = new Set<string>()

  const add = (label: string, token: string) => {
    const t = token.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    clients.push({ label: label.trim() || 'default', token: t })
  }

  for (const entry of multi.split(',')) {
    const raw = entry.trim()
    if (!raw) continue

    const sep = raw.indexOf(':')
    if (sep === -1) add('default', raw)
    else add(raw.slice(0, sep), raw.slice(sep + 1))
  }

  add('default', single)

  const tooShort = clients.filter((c) => c.token.length < MIN_TOKEN_LENGTH)
  if (tooShort.length > 0) {
    throw new Error(
      `Token quá ngắn (tối thiểu ${MIN_TOKEN_LENGTH} ký tự): ${tooShort.map((c) => c.label).join(', ')}`,
    )
  }

  if (clients.length === 0) {
    throw new Error(
      'Phải khai báo ít nhất một token cho /api/mcp qua MCP_API_TOKEN hoặc MCP_API_TOKENS.',
    )
  }

  return clients
}

let cached: AppConfig | null = null

export function getConfig(): AppConfig {
  if (cached) return cached

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}`)
  }

  const env = parsed.data

  cached = {
    databaseUrl: env.DATABASE_URL,
    databaseSsl: toBool(env.DATABASE_SSL),
    linkSigningSecret: env.LINK_SIGNING_SECRET,
    ipSalt: env.IP_SALT,
    apiClients: parseApiClients(env.MCP_API_TOKEN, env.MCP_API_TOKENS),
    publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
    signatureTtl: toPositiveInt(env.SIGNATURE_TTL, 2_592_000, 'SIGNATURE_TTL'),
    defaultTimeWait: toPositiveInt(env.DEFAULT_TIME_WAIT, 3000, 'DEFAULT_TIME_WAIT'),
    ga4Id: env.GA4_ID.trim(),
    allowedDestinationHosts: env.ALLOWED_DESTINATION_HOSTS.split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  }

  return cached
}

/** Chỉ dùng trong test. */
export function resetConfigCache(): void {
  cached = null
}
