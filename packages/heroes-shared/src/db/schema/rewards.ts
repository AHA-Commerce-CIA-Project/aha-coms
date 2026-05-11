import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchKey: varchar('branch_key', { length: 128 }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    pointCost: integer('point_cost').notNull(),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_rewards_branch').on(t.branchKey),
    check('chk_point_cost_positive', sql`point_cost > 0`),
  ],
)
