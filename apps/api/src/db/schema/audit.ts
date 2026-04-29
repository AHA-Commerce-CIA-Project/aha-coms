import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { identityUsers } from './identity-users'
import { appRegistry } from './apps'

export const accessAuditLog = pgTable(
  'access_audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => identityUsers.id),
    action: varchar('action', { length: 50 }).notNull(),
    targetType: varchar('target_type', { length: 50 }).notNull(),
    targetId: uuid('target_id').notNull(),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actorIp: varchar('actor_ip', { length: 45 }),
    requestId: uuid('request_id'),
    actorAppId: uuid('actor_app_id').references(() => appRegistry.id),
    targetAppId: uuid('target_app_id').references(() => appRegistry.id),
  },
  (table) => ({
    idxAccessAuditLogActorAppCreatedAt: index('idx_access_audit_log_actor_app_created_at').on(
      table.actorAppId,
      table.createdAt,
    ),
    idxAccessAuditLogTargetAppCreatedAt: index('idx_access_audit_log_target_app_created_at').on(
      table.targetAppId,
      table.createdAt,
    ),
  }),
)

export const accessAuditLogRelations = relations(accessAuditLog, ({ one }) => ({
  actor: one(identityUsers, {
    fields: [accessAuditLog.actorId],
    references: [identityUsers.id],
  }),
}))

export type AccessAuditLog = typeof accessAuditLog.$inferSelect
export type NewAccessAuditLog = typeof accessAuditLog.$inferInsert
