import {
  pgTable,
  uuid,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core'

export const userConfigCache = pgTable('user_config_cache', {
  portalSub: uuid('portal_sub').primaryKey(),
  config: jsonb('config').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
})
