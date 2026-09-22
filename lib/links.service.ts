import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { getConfig } from './config'
import { getDb } from './db'
import { linkVisits, links, type LinkRow } from './db/schema'
import { detectBot } from './bot'
import {
  buildQueryString,
  ensureContinueParam,
  findContinueValue,
  resolveParameters,
  type LinkParameter,
} from './params'
import { aliasCandidate, isValidAlias, randomAlias, slugify } from './slug'
import { expiresAt, sign } from './signature'
import { checkUrl } from './url-guard'
import type { GenerateRedirectUrlInput } from './schemas'

const MAX_ALIAS_ATTEMPTS = 5
const PG_UNIQUE_VIOLATION = '23505'

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === PG_UNIQUE_VIOLATION
}

// ---------------------------------------------------------------------------
// Tạo link
// ---------------------------------------------------------------------------

export interface CreateLinkResult {
  url: string
  alias: string
  linkId: string
  /** Unix seconds — hạn của chữ ký, KHÔNG phải hạn của link. */
  expires: number
}

export async function createLink(
  input: GenerateRedirectUrlInput,
  opts: { createdBy?: string } = {},
): Promise<CreateLinkResult> {
  const cfg = getConfig()
  const db = getDb()

  // 1. URL đích phải qua được lớp bảo vệ. Một chỗ duy nhất quyết định chính sách.
  const destCheck = checkUrl(input.destination_url, {
    allowedHosts: cfg.allowedDestinationHosts,
  })
  if (!destCheck.ok) {
    throw new ServiceError(
      `destination_url không hợp lệ (${destCheck.reason}). Chỉ chấp nhận http/https trỏ tới host công khai.`,
      `invalid_destination_url:${destCheck.reason}`,
    )
  }

  // Giữ nguyên chuỗi agent truyền vào, KHÔNG dùng destCheck.url.toString().
  // URL.toString() chuẩn hoá đường dẫn — "https://projecta.com?code=x" thành
  // "https://projecta.com/?code=x". Hai URL tương đương về mặt chức năng, nhưng
  // trang đích có thể so khớp chuỗi, và ví dụ trong spec cũng không có dấu "/".
  // Việc kiểm tra an toàn đã làm trên bản đã parse ở ngay trên.
  const destinationUrl = input.destination_url.trim()

  // 2. Alias: dùng cái agent truyền, hoặc sinh từ title.
  let base = input.alias ?? slugify(input.title)
  if (!base || !isValidAlias(base)) {
    base = slugify(input.title)
  }
  if (!base) {
    // Title toàn ký tự đặc biệt hoặc chữ không thuộc bảng Latin.
    base = randomAlias()
  }

  const timeWait = input.time_wait ?? cfg.defaultTimeWait
  const forwardParams = input.forward_params ?? false

  // Alias có thể đổi giữa các lần thử, mà `{{alias}}` là placeholder hợp lệ,
  // nên tham số phải dựng lại theo từng ứng viên.
  const buildParameters = (alias: string): LinkParameter[] =>
    ensureContinueParam(
      resolveParameters(input.parameters ?? [], {
        destination_url: destinationUrl,
        alias,
        title: input.title,
      }),
      destinationUrl,
    )

  // 3. Chèn, đụng alias thì thử hậu tố tiếp theo.
  //    Agent chỉ định alias tường minh mà trùng thì báo lỗi thay vì đổi ngầm —
  //    đổi ngầm sẽ khiến agent gắn nhầm link vào email.
  const explicitAlias = input.alias !== undefined
  let inserted: { id: string; alias: string } | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_ALIAS_ATTEMPTS; attempt++) {
    const candidate = explicitAlias ? base : aliasCandidate(base, attempt)

    const resolvedParameters = buildParameters(candidate)

    try {
      const rows = await db
        .insert(links)
        .values({
          alias: candidate,
          destinationUrl,
          title: input.title,
          description: input.desc ?? null,
          timeWait,
          parameters: resolvedParameters,
          forwardParams,
          createdBy: opts.createdBy ?? null,
        })
        .returning({ id: links.id, alias: links.alias })

      inserted = rows[0] ?? null
      break
    } catch (err) {
      lastError = err
      if (!isUniqueViolation(err)) throw err
      if (explicitAlias) {
        throw new ServiceError(
          `alias "${base}" đã tồn tại. Chọn alias khác hoặc bỏ trống để hệ thống tự sinh.`,
          'alias_taken',
        )
      }
      // Alias tự sinh bị trùng — vòng lặp sẽ thử hậu tố tiếp theo.
    }
  }

  // Hết lượt thử: rơi về alias ngẫu nhiên, gần như chắc chắn không đụng.
  if (!inserted) {
    const candidate = randomAlias(base.slice(0, 40) || 'link')
    const resolvedParameters = buildParameters(candidate)

    try {
      const rows = await db
        .insert(links)
        .values({
          alias: candidate,
          destinationUrl,
          title: input.title,
          description: input.desc ?? null,
          timeWait,
          parameters: resolvedParameters,
          forwardParams,
          createdBy: opts.createdBy ?? null,
        })
        .returning({ id: links.id, alias: links.alias })
      inserted = rows[0] ?? null
    } catch (err) {
      lastError = err
    }
  }

  if (!inserted) {
    throw new ServiceError(
      `Không tạo được alias duy nhất sau ${MAX_ALIAS_ATTEMPTS + 1} lần thử: ${String(lastError)}`,
      'alias_generation_failed',
    )
  }

  // 4. Ký và dựng URL trả về.
  const finalParameters = buildParameters(inserted.alias)

  const continueValue = findContinueValue(finalParameters)
  const expires = expiresAt(cfg.signatureTtl)
  const signature = sign(cfg.linkSigningSecret, inserted.alias, continueValue, expires)

  const qs = buildQueryString(finalParameters)
  const tail = `expires=${expires}&signature=${signature}`
  const query = qs ? `${qs}&${tail}` : tail

  return {
    url: `${cfg.publicBaseUrl}/r/${encodeURIComponent(inserted.alias)}?${query}`,
    alias: inserted.alias,
    linkId: inserted.id,
    expires,
  }
}

// ---------------------------------------------------------------------------
// Đọc link
// ---------------------------------------------------------------------------

/** Trả về null khi không tìm thấy, link đã tắt, hoặc link đã hết hạn. */
export async function getLinkByAlias(alias: string): Promise<LinkRow | null> {
  const db = getDb()

  const rows = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.alias, alias),
        eq(links.status, 'active'),
        or(isNull(links.expiresAt), sql`${links.expiresAt} > now()`),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Sửa link đã tạo
// ---------------------------------------------------------------------------

export interface UpdateLinkInput {
  alias: string
  destination_url?: string
  title?: string
  desc?: string | null
  time_wait?: number
  forward_params?: boolean
  status?: 'active' | 'disabled'
}

/**
 * Sửa một link đã tồn tại. Trả về null nếu không có alias đó.
 *
 * Lưu ý về `destination_url`: các URL đã gửi đi trong email mang sẵn tham số
 * `continue` trỏ tới đích CŨ và chữ ký của nó. Đổi đích ở đây chỉ đổi luồng
 * chính (tra alias trong database); nhánh dự phòng của những email đã gửi vẫn
 * dẫn về đích cũ. Không tự sửa được vì email đã nằm trong hộp thư người nhận.
 */
export async function updateLink(input: UpdateLinkInput): Promise<LinkRow | null> {
  const cfg = getConfig()
  const db = getDb()

  const patch: Partial<typeof links.$inferInsert> = {}

  if (input.destination_url !== undefined) {
    const check = checkUrl(input.destination_url, { allowedHosts: cfg.allowedDestinationHosts })
    if (!check.ok) {
      throw new ServiceError(
        `destination_url không hợp lệ (${check.reason}). Chỉ chấp nhận http/https trỏ tới host công khai.`,
        `invalid_destination_url:${check.reason}`,
      )
    }
    patch.destinationUrl = input.destination_url.trim()
  }

  if (input.title !== undefined) patch.title = input.title
  if (input.desc !== undefined) patch.description = input.desc
  if (input.time_wait !== undefined) patch.timeWait = input.time_wait
  if (input.forward_params !== undefined) patch.forwardParams = input.forward_params
  if (input.status !== undefined) patch.status = input.status

  if (Object.keys(patch).length === 0) {
    throw new ServiceError('Không có trường nào để sửa.', 'nothing_to_update')
  }

  patch.updatedAt = new Date()

  const rows = await db
    .update(links)
    .set(patch)
    .where(eq(links.alias, input.alias))
    .returning()

  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Ghi nhận truy cập
// ---------------------------------------------------------------------------

function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${ip}${salt}`, 'utf8').digest('hex')
}

/** Render đặt IP thật ở x-forwarded-for; phần tử đầu là client gốc. */
function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || null
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

export interface RecordVisitInput {
  link: Pick<LinkRow, 'id' | 'alias'>
  headers: Headers
  query?: Record<string, string>
}

/** Trả về `visitToken` để client bắn kèm beacon xác nhận chuyển hướng thật. */
export async function recordVisit(input: RecordVisitInput): Promise<string> {
  const cfg = getConfig()
  const db = getDb()

  const { isBot } = detectBot(input.headers)
  const ip = clientIp(input.headers)
  const visitToken = randomBytes(16).toString('hex') // 32 ký tự, khớp char(32)

  await db.insert(linkVisits).values({
    linkId: input.link.id,
    alias: input.link.alias,
    ipHash: ip ? hashIp(ip, cfg.ipSalt) : null,
    userAgent: truncate(input.headers.get('user-agent'), 512),
    referer: truncate(input.headers.get('referer'), 512),
    query: input.query ?? null,
    isBot,
    redirected: false,
    visitToken,
  })

  return visitToken
}

/**
 * Đánh dấu lượt truy cập đã thực sự chuyển hướng.
 * Trả về true nếu tìm thấy đúng một lượt khớp token.
 */
export async function markRedirected(visitToken: string): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(visitToken)) return false

  const db = getDb()
  const rows = await db
    .update(linkVisits)
    .set({ redirected: true })
    .where(and(eq(linkVisits.visitToken, visitToken), eq(linkVisits.redirected, false)))
    .returning({ id: linkVisits.id })

  return rows.length > 0
}

// ---------------------------------------------------------------------------
// Thống kê
// ---------------------------------------------------------------------------

export interface LinkStats {
  /** Tổng số lần trang bọc được mở, kể cả bot. */
  total_views: number
  /** Lượt có trình duyệt thật xác nhận chuyển hướng và không bị nhận diện là bot. */
  real_clicks: number
  /** Lượt bị nhận diện là máy mở. */
  bot_views: number
  last_visited_at: string | null
}

export async function getStats(linkId: string): Promise<LinkStats> {
  const db = getDb()

  const rows = await db
    .select({
      totalViews: sql<number>`count(*)::int`,
      realClicks: sql<number>`count(*) filter (where ${linkVisits.redirected} and not ${linkVisits.isBot})::int`,
      botViews: sql<number>`count(*) filter (where ${linkVisits.isBot})::int`,
      lastVisitedAt: sql<Date | null>`max(${linkVisits.visitedAt})`,
    })
    .from(linkVisits)
    .where(eq(linkVisits.linkId, linkId))

  const r = rows[0]
  return {
    total_views: r?.totalViews ?? 0,
    real_clicks: r?.realClicks ?? 0,
    bot_views: r?.botViews ?? 0,
    last_visited_at: r?.lastVisitedAt ? new Date(r.lastVisitedAt).toISOString() : null,
  }
}
