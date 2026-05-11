import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'

export const aliasCache = pgTable(
  'alias_cache',
  {
    aliasNormalized: varchar('alias_normalized', { length: 255 }).primaryKey(),
    aliasId: uuid('alias_id').notNull(),
    portalSub: uuid('portal_sub').notNull(),
    isPrimary: boolean('is_primary').notNull(),
    tombstoned: boolean('tombstoned').notNull().default(false),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('alias_cache_portal_sub_idx').on(t.portalSub)],
)
