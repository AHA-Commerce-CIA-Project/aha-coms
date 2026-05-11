import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const IDENTITY_USER_EMAIL_REMOVED_REASONS = [
  'admin_action',
  'self_service',
  'collision_resolve',
  'cascade_deactivate',
  'replaced',
] as const
export type IdentityUserEmailRemovedReason = (typeof IDENTITY_USER_EMAIL_REMOVED_REASONS)[number]

export const identityUserEmailsHistory = pgTable(
  'identity_user_emails_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    formerIdentityUserId: uuid('former_identity_user_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    addedBy: varchar('added_by', { length: 20 }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }).notNull().defaultNow(),
    removedBy: uuid('removed_by').references(() => identityUsers.id),
    removedReason: varchar('removed_reason', { length: 50 }).notNull(),
  },
  (t) => [
    index('identity_user_emails_history_email_idx').on(t.emailNormalized),
    index('identity_user_emails_history_former_user_idx').on(t.formerIdentityUserId),
  ],
)

export type IdentityUserEmailHistory = typeof identityUserEmailsHistory.$inferSelect
