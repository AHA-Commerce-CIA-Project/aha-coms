import { pgTable, uuid, varchar, text, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { heroesProfiles } from './heroes-profiles'

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchKey: varchar('branch_key', { length: 128 }),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => heroesProfiles.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_comments_entity').on(t.entityType, t.entityId),
    index('idx_comments_branch').on(t.branchKey),
    check(
      'chk_entity_type',
      sql`entity_type IN ('achievement', 'challenge', 'appeal')`,
    ),
  ],
)
