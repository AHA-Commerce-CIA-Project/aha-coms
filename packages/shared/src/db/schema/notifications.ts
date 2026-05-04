import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { heroesProfiles } from './heroes-profiles'

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => heroesProfiles.id),
    type: varchar('type', { length: 50 }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityType: varchar('entity_type', { length: 30 }),
    entityId: uuid('entity_id'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_notifications_user').on(t.userId, t.isRead),
    index('idx_notifications_read_cleanup')
      .on(t.readAt)
      .where(sql`is_read = true`),
    index('idx_notifications_branch').on(t.branchId),
  ],
)
