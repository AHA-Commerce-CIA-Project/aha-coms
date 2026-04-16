import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const accessAuditLog = pgTable('access_audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => identityUsers.id),
  action: varchar('action', { length: 50 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: uuid('target_id').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accessAuditLogRelations = relations(accessAuditLog, ({ one }) => ({
  actor: one(identityUsers, {
    fields: [accessAuditLog.actorId],
    references: [identityUsers.id],
  }),
}))

export type AccessAuditLog = typeof accessAuditLog.$inferSelect
export type NewAccessAuditLog = typeof accessAuditLog.$inferInsert
