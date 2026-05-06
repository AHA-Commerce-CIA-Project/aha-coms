import { pgTable, uuid, varchar, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { appRegistry } from './apps'

export const appManifests = pgTable('app_manifests', {
  appId: uuid('app_id')
    .primaryKey()
    .references(() => appRegistry.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 128 }).notNull(),
  configSchema: jsonb('config_schema').notNull(),
  schemaVersion: integer('schema_version').notNull().default(2),
  taxonomies: jsonb('taxonomies').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const appManifestsRelations = relations(appManifests, ({ one }) => ({
  app: one(appRegistry, {
    fields: [appManifests.appId],
    references: [appRegistry.id],
  }),
}))

export type AppManifest = typeof appManifests.$inferSelect
export type NewAppManifest = typeof appManifests.$inferInsert
