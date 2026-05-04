import { pgTable, uuid, integer, text, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { redemptionStatusEnum } from './enums'
import { heroesProfiles } from './heroes-profiles'
import { rewards } from './rewards'

export const redemptions = pgTable(
  'redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => heroesProfiles.id),
    rewardId: uuid('reward_id')
      .notNull()
      .references(() => rewards.id),
    pointsSpent: integer('points_spent').notNull(),
    notes: text('notes'),
    status: redemptionStatusEnum('status').notNull().default('pending'),
    approvedBy: uuid('approved_by').references(() => heroesProfiles.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_redemptions_user').on(t.userId),
    index('idx_redemptions_branch').on(t.branchId),
    check('chk_points_spent_positive', sql`points_spent > 0`),
  ],
)
