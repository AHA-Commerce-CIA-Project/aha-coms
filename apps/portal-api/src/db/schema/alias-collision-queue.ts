import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const ALIAS_COLLISION_SOURCES = ['auto_seed', 'sheet_import', 'manual'] as const
export type AliasCollisionSource = (typeof ALIAS_COLLISION_SOURCES)[number]

export const ALIAS_COLLISION_STATUSES = ['pending', 'resolved', 'rejected'] as const
export type AliasCollisionStatus = (typeof ALIAS_COLLISION_STATUSES)[number]

export const ALIAS_COLLISION_RESOLUTION_ACTIONS = ['merge', 'create_new', 'reject'] as const
export type AliasCollisionResolutionAction = (typeof ALIAS_COLLISION_RESOLUTION_ACTIONS)[number]

export const aliasCollisionQueue = pgTable(
  'alias_collision_queue',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    rawName: varchar('raw_name', { length: 255 }).notNull(),
    rawNameNormalized: varchar('raw_name_normalized', { length: 255 }).notNull(),
    suggestedIdentityUserId: uuid('suggested_identity_user_id').references(
      () => identityUsers.id,
    ),
    source: varchar('source', { length: 20 }).notNull(),
    context: jsonb('context').notNull().default(sql`'{}'::jsonb`),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => identityUsers.id),
    resolutionAction: varchar('resolution_action', { length: 16 }),
  },
  (t) => [
    index('alias_collision_queue_status_idx').on(t.status),
    index('alias_collision_queue_normalized_idx').on(t.rawNameNormalized),
  ],
)

export type AliasCollisionQueueItem = typeof aliasCollisionQueue.$inferSelect
export type NewAliasCollisionQueueItem = typeof aliasCollisionQueue.$inferInsert
