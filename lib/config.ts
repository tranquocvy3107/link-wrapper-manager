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
  MCP_API_TOKEN: z.string().min(16, 'MCP_API_TOKEN phải dài ít nhất 16 ký tự'),

  PUBLIC_BASE_URL: z.string().min(1, 'PUBLIC_BASE_URL là bắt buộc'),
  SIGNATURE_TTL: z.string().default('2592000'),
  DEFAULT_TIME_WAIT: z.string().default('3000'),

  GA4_ID: z.string().default(''),
  ALLOWED_DESTINATION_HOSTS: z.string().default(''),
})

export interface AppConfig {
  databaseUrl: string
  databaseSsl: boolean
  linkSigningSecret: string
  ipSalt: string
  mcpApiToken: string
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
    mcpApiToken: env.MCP_API_TOKEN,
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
