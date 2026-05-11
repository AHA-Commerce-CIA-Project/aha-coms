import { pgTable, uuid, varchar, integer, jsonb, timestamp, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { heroesProfiles } from './heroes-profiles'

export const sheetSyncJobs = pgTable(
  'sheet_sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchKey: varchar('branch_key', { length: 128 }),
    direction: varchar('direction', { length: 10 }).notNull(),
    sheetId: varchar('sheet_id', { length: 255 }).notNull(),
    sheetName: varchar('sheet_name', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    rowsProcessed: integer('rows_processed').default(0),
    rowsFailed: integer('rows_failed').default(0),
    errorLog: jsonb('error_log'),
    startedBy: uuid('started_by').references(() => heroesProfiles.id),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check('chk_sync_direction', sql`direction IN ('import', 'export', 'resync')`)],
)
