import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const USER_ALIAS_SOURCES = ['auto_seed', 'manual', 'name_update'] as const
export type UserAliasSource = (typeof USER_ALIAS_SOURCES)[number]

export const userAliases = pgTable(
  'user_aliases',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    identityUserId: uuid('identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    alias: varchar('alias', { length: 255 }).notNull(),
    // alias_normalized is a Postgres GENERATED ALWAYS AS column in prod.
    // The TS column here is a plain varchar so Drizzle models the select type.
    // The .sql migration file is the source of truth for the GENERATED expression.
    aliasNormalized: varchar('alias_normalized', { length: 255 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    source: varchar('source', { length: 20 }).notNull().default('auto_seed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => identityUsers.id),
  },
  (t) => [
    uniqueIndex('user_aliases_alias_normalized_uniq').on(t.aliasNormalized),
    uniqueIndex('user_aliases_one_primary_per_user_uniq')
      .on(t.identityUserId)
      .where(sql`${t.isPrimary} = true`),
    index('user_aliases_identity_user_id_idx').on(t.identityUserId),
  ],
)

export type UserAlias = typeof userAliases.$inferSelect
export type NewUserAlias = typeof userAliases.$inferInsert
