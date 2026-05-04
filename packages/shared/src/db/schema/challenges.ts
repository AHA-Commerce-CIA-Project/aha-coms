import { pgTable, uuid, text, varchar, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { achievementPoints } from './achievement-points'
import { heroesProfiles } from './heroes-profiles'

export const challenges = pgTable(
  'challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id'),
    achievementId: uuid('achievement_id')
      .notNull()
      .references(() => achievementPoints.id),
    challengerId: uuid('challenger_id')
      .notNull()
      .references(() => heroesProfiles.id),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => heroesProfiles.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_challenges_achievement').on(t.achievementId),
    index('idx_challenges_branch').on(t.branchId),
    check(
      'chk_challenge_status',
      sql`status IN ('open', 'upheld', 'overturned')`,
    ),
  ],
)
