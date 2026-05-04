import {
  pgTable,
  uuid,
  integer,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { pointStatusEnum } from './enums'
import { heroesProfiles } from './heroes-profiles'
import { pointCategories } from './point-categories'

export const achievementPoints = pgTable(
  'achievement_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => heroesProfiles.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => pointCategories.id),
    points: integer('points').notNull(),
    reason: text('reason').notNull(),
    relatedStaff: text('related_staff'),
    screenshotUrl: text('screenshot_url'),
    kittaComponent: varchar('kitta_component', { length: 2 }),
    status: pointStatusEnum('status').notNull().default('pending'),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => heroesProfiles.id),
    approvedBy: uuid('approved_by').references(() => heroesProfiles.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => heroesProfiles.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_points_branch').on(t.branchId),
    index('idx_points_branch_created').on(t.branchId, t.createdAt.desc()),
    index('idx_points_user').on(t.userId),
    index('idx_points_status').on(t.status),
    index('idx_points_category').on(t.categoryId),
    index('idx_points_submitted_by').on(t.submittedBy),
    index('idx_points_created_at').on(t.createdAt),
    check('chk_points_positive', sql`points > 0`),
    check(
      'chk_kitta_values',
      sql`kitta_component IS NULL OR kitta_component IN ('K', 'I', 'T1', 'T2', 'A')`,
    ),
  ],
)
