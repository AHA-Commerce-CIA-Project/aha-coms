import { pgTable, uuid, varchar, jsonb, inet, timestamp, index } from 'drizzle-orm/pg-core'
import { heroesProfiles } from './heroes-profiles'

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => heroesProfiles.id),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_branch').on(t.branchId),
    index('idx_audit_actor').on(t.actorId),
    index('idx_audit_entity').on(t.entityType, t.entityId),
  ],
)
