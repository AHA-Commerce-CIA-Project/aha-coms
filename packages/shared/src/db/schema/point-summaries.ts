import { pgTable, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { heroesProfiles } from './heroes-profiles'

export const pointSummaries = pgTable(
  'point_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => heroesProfiles.id)
      .unique(),
    bintangCount: integer('bintang_count').notNull().default(0),
    penaltiPointsSum: integer('penalti_points_sum').notNull().default(0),
    directPoinAha: integer('direct_poin_aha').notNull().default(0),
    redeemedTotal: integer('redeemed_total').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_point_summaries_leaderboard_bintang').on(t.branchId, t.bintangCount),
    index('idx_point_summaries_branch_user').on(t.branchId, t.userId),
  ],
)
