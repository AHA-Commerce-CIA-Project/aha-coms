import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const workspaceSyncLog = pgTable('workspace_sync_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  triggeredBy: varchar('triggered_by', { length: 100 }).notNull(),
  totalWorkspaceUsers: integer('total_workspace_users'),
  created: integer('created').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  deactivated: integer('deactivated').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  errors: jsonb('errors').$type<Array<{ email: string; message: string }>>().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export type WorkspaceSyncLog = typeof workspaceSyncLog.$inferSelect
export type NewWorkspaceSyncLog = typeof workspaceSyncLog.$inferInsert
