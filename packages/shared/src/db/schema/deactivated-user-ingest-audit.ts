import {
  pgTable,
  uuid,
  integer,
  text,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const deactivatedUserIngestAudit = pgTable(
  'deactivated_user_ingest_audit',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sheetId: text('sheet_id').notNull(),
    sheetRowNumber: integer('sheet_row_number').notNull(),
    portalSub: uuid('portal_sub').notNull(),
    rawPayload: jsonb('raw_payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
)
