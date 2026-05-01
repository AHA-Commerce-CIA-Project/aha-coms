import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const ONE_TIME_LOGIN_LINK_REASONS = [
  'lost_email_access',
  'support_handoff',
  'identity_recovery',
  'other',
] as const
export type OneTimeLoginLinkReason = (typeof ONE_TIME_LOGIN_LINK_REASONS)[number]

export const oneTimeLoginLinks = pgTable(
  'one_time_login_links',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    targetIdentityUserId: uuid('target_identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    issuedBy: uuid('issued_by')
      .notNull()
      .references(() => identityUsers.id),
      // Must be a super_admin per access-control rule below.
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),  // SHA-256 of the URL token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
      // 5-minute TTL.
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    reason: varchar('reason', { length: 32 }).notNull(),
    reasonText: text('reason_text'),
      // Free-text justification from the issuing admin.
    issuedFromIp: varchar('issued_from_ip', { length: 45 }),
    consumedFromIp: varchar('consumed_from_ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('one_time_login_links_token_hash_uniq').on(t.tokenHash),
    index('one_time_login_links_target_idx').on(t.targetIdentityUserId),
    index('one_time_login_links_issued_by_idx').on(t.issuedBy),
  ],
)

export type OneTimeLoginLink = typeof oneTimeLoginLinks.$inferSelect
export type NewOneTimeLoginLink = typeof oneTimeLoginLinks.$inferInsert
