import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { appManifests } from './app-manifests'
import { identityUsers } from './identity-users'

export const bulkEditLocks = pgTable('bulk_edit_locks', {
  appId: uuid('app_id')
    .primaryKey()
    .references(() => appManifests.appId, { onDelete: 'cascade' }),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  acquiredBy: uuid('acquired_by')
    .notNull()
    .references(() => identityUsers.id),
})

export const bulkEditLocksRelations = relations(bulkEditLocks, ({ one }) => ({
  manifest: one(appManifests, {
    fields: [bulkEditLocks.appId],
    references: [appManifests.appId],
  }),
  acquiredByUser: one(identityUsers, {
    fields: [bulkEditLocks.acquiredBy],
    references: [identityUsers.id],
  }),
}))

export type BulkEditLock = typeof bulkEditLocks.$inferSelect
export type NewBulkEditLock = typeof bulkEditLocks.$inferInsert
