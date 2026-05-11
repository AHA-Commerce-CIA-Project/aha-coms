import { pgTable, uuid, integer, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { identityUsers } from './identity-users'
import { appManifests } from './app-manifests'

export const appUserConfig = pgTable(
  'app_user_config',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    portalSub: uuid('portal_sub')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => appManifests.appId),
    config: jsonb('config').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => identityUsers.id),
  },
  (t) => [
    uniqueIndex('app_user_config_portal_sub_app_id_uniq').on(t.portalSub, t.appId),
    index('app_user_config_app_id_idx').on(t.appId),
  ],
)

export const appUserConfigRelations = relations(appUserConfig, ({ one }) => ({
  user: one(identityUsers, {
    fields: [appUserConfig.portalSub],
    references: [identityUsers.id],
    relationName: 'appUserConfigUser',
  }),
  manifest: one(appManifests, {
    fields: [appUserConfig.appId],
    references: [appManifests.appId],
  }),
  updatedByUser: one(identityUsers, {
    fields: [appUserConfig.updatedBy],
    references: [identityUsers.id],
    relationName: 'appUserConfigUpdatedBy',
  }),
}))

export type AppUserConfig = typeof appUserConfig.$inferSelect
export type NewAppUserConfig = typeof appUserConfig.$inferInsert
