import {
  bigserial,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import type { LinkParameter } from '../params'

export const links = pgTable('links', {
  id: uuid('id').primaryKey().defaultRandom(),
  alias: varchar('alias', { length: 64 }).notNull().unique(),
  destinationUrl: text('destination_url').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: varchar('description', { length: 500 }),
  timeWait: integer('time_wait').notNull().default(3000),
  /** Tham số đã resolve placeholder, lưu nguyên dạng [{key,value}]. */
  parameters: jsonb('parameters').$type<LinkParameter[]>().notNull().default([]),
  /** Có mang utm_* sang URL đích hay không. */
  forwardParams: boolean('forward_params').notNull().default(false),
  /** 'active' | 'disabled' */
  status: varchar('status', { length: 16 }).notNull().default('active'),
  /** Hạn dùng của LINK. Khác hoàn toàn với `expires` của chữ ký. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: varchar('created_by', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const linkVisits = pgTable(
  'link_visits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Null hoá khi link bị xoá — lịch sử truy cập vẫn giữ, tra bằng `alias`. */
    linkId: uuid('link_id').references(() => links.id, { onDelete: 'set null' }),
    alias: varchar('alias', { length: 64 }).notNull(),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
    /** sha256(ip + IP_SALT). Không bao giờ lưu IP thô. */
    ipHash: char('ip_hash', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    referer: varchar('referer', { length: 512 }),
    query: jsonb('query').$type<Record<string, string>>(),
    country: char('country', { length: 2 }),
    isBot: boolean('is_bot').notNull().default(false),
    /** true khi beacon /api/track xác nhận trình duyệt thật đã chuyển hướng. */
    redirected: boolean('redirected').notNull().default(false),
    /** Khớp beacon với đúng lượt truy cập này. */
    visitToken: char('visit_token', { length: 32 }),
  },
  (t) => [
    index('idx_visits_alias_time').on(t.alias, t.visitedAt),
    index('idx_visits_link_time').on(t.linkId, t.visitedAt),
    index('idx_visits_token').on(t.visitToken),
  ],
)

export type LinkRow = typeof links.$inferSelect
export type NewLinkRow = typeof links.$inferInsert
export type LinkVisitRow = typeof linkVisits.$inferSelect
export type NewLinkVisitRow = typeof linkVisits.$inferInsert
