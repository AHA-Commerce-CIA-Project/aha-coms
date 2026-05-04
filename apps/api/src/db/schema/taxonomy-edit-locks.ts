import { pgTable, varchar, uuid, timestamp } from 'drizzle-orm/pg-core'
import { identityUsers } from './identity-users'

export const taxonomyEditLocks = pgTable('taxonomy_edit_locks', {
  taxonomyId: varchar('taxonomy_id', { length: 64 }).primaryKey(),
  acquiredBy: uuid('acquired_by')
    .notNull()
    .references(() => identityUsers.id),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TaxonomyEditLock = typeof taxonomyEditLocks.$inferSelect
export type NewTaxonomyEditLock = typeof taxonomyEditLocks.$inferInsert
