import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const sessionRevocations = pgTable(
  'session_revocations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    gipUid: text('gip_uid').notNull(),
    // 'logout' | 'status_change' | 'offboarded' | 'admin'
    reason: varchar('reason', { length: 30 }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
    // Sessions issued at or before this instant are considered revoked
    notBefore: timestamp('not_before', { withTimezone: true }).notNull(),
  },
  (t) => [index('session_revocations_user_revoked_idx').on(t.userId, t.revokedAt)],
)

export const sessionRevocationsRelations = relations(sessionRevocations, ({ one }) => ({
  user: one(identityUsers, {
    fields: [sessionRevocations.userId],
    references: [identityUsers.id],
  }),
}))

export type SessionRevocation = typeof sessionRevocations.$inferSelect
export type NewSessionRevocation = typeof sessionRevocations.$inferInsert
