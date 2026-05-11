import {
  pgTable,
  uuid,
  integer,
  text,
  varchar,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const pendingAliasResolution = pgTable(
  'pending_alias_resolution',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sheetId: text('sheet_id').notNull(),
    sheetRowNumber: integer('sheet_row_number').notNull(),
    rawName: varchar('raw_name', { length: 255 }).notNull(),
    rawNameNormalized: varchar('raw_name_normalized', { length: 255 }).notNull(),
    rawPayload: jsonb('raw_payload').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastRetryAt: timestamp('last_retry_at', { withTimezone: true }),
    retryCount: integer('retry_count').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
  },
  (t) => [
    index('pending_alias_raw_name_normalized_idx').on(t.rawNameNormalized),
    index('pending_alias_status_idx').on(t.status),
  ],
)
