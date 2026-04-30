import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const AUTH_METHODS = ['workspace_oidc', 'personal_otp', 'admin_bypass'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

export const SESSION_REVOKED_REASONS = [
  'logout',
  'logout_other_device',
  'logout_all_other',
  'admin_revoke',
  'status_change',
  'superseded',
] as const
export type SessionRevokedReason = (typeof SESSION_REVOKED_REASONS)[number]

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    identityUserId: uuid('identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    authMethod: varchar('auth_method', { length: 20 }).notNull(),
    emailUsed: varchar('email_used', { length: 255 }),
    deviceLabel: varchar('device_label', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: varchar('revoked_reason', { length: 30 }),
  },
  (t) => [
    index('auth_sessions_identity_user_id_idx').on(t.identityUserId),
    index('auth_sessions_active_idx')
      .on(t.identityUserId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
)

export type AuthSession = typeof authSessions.$inferSelect
export type NewAuthSession = typeof authSessions.$inferInsert
