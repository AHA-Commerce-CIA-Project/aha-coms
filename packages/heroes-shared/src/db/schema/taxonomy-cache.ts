import {
  pgTable,
  varchar,
  jsonb,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const taxonomyCache = pgTable(
  'taxonomy_cache',
  {
    taxonomyId: varchar('taxonomy_id', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    metadata: jsonb('metadata'),
    cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taxonomyId, t.key] })],
)
