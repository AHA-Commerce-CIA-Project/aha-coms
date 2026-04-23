import { pgTable, uuid, varchar, text, timestamp, unique, integer, uniqueIndex, jsonb } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { teams } from './teams'
import { identityUsers } from './identity-users'
import {
  DEFAULT_AUTH_TRANSPORT_MODE,
  PLATFORM_AUTH_CONTRACT_VERSION,
} from '@coms-portal/shared/contracts/auth'
import type { PortalAppRole } from '@coms-portal/shared/contracts/integration-manifest'

export const appRegistry = pgTable('app_registry', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar('slug', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  url: varchar('url', { length: 500 }).notNull(),
  basePath: varchar('base_path', { length: 100 }).notNull(),
  iconUrl: text('icon_url'),
  cloudRunService: varchar('cloud_run_service', { length: 100 }),
  adapterType: varchar('adapter_type', { length: 40 }).notNull().default('server_middleware'),
  transportMode: varchar('transport_mode', { length: 40 })
    .notNull()
    .default(DEFAULT_AUTH_TRANSPORT_MODE),
  handoffMode: varchar('handoff_mode', { length: 40 }).notNull().default('one_time_code'),
  brokerOrigin: text('broker_origin'),
  brokerSigningSecret: text('broker_signing_secret'),
  introspectSecret: text('introspect_secret'),
  contractVersion: integer('contract_version').notNull().default(PLATFORM_AUTH_CONTRACT_VERSION),
  complianceStatus: varchar('compliance_status', { length: 20 }).notNull().default('draft'),
  manifestPath: text('manifest_path'),
  appRoles: jsonb('app_roles').$type<PortalAppRole[]>().notNull().default(sql`'[]'::jsonb`),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  healthStatus: varchar('health_status', { length: 20 }).notNull().default('unknown'),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  lastHealthError: text('last_health_error'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
},
(t) => [
  uniqueIndex('app_registry_slug_active_unique')
    .on(t.slug)
    .where(sql`${t.status} != 'deprecated'`),
])

export const teamAppAccess = pgTable(
  'team_app_access',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => appRegistry.id, { onDelete: 'cascade' }),
    appRole: varchar('app_role', { length: 50 }),
    grantedBy: uuid('granted_by').references(() => identityUsers.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.teamId, t.appId)],
)

export const appRegistryRelations = relations(appRegistry, ({ many }) => ({
  teamAccess: many(teamAppAccess),
}))

export const teamAppAccessRelations = relations(teamAppAccess, ({ one }) => ({
  team: one(teams, { fields: [teamAppAccess.teamId], references: [teams.id] }),
  app: one(appRegistry, { fields: [teamAppAccess.appId], references: [appRegistry.id] }),
  grantedByUser: one(identityUsers, {
    fields: [teamAppAccess.grantedBy],
    references: [identityUsers.id],
  }),
}))

export type AppRegistry = typeof appRegistry.$inferSelect
export type NewAppRegistry = typeof appRegistry.$inferInsert
export type TeamAppAccess = typeof teamAppAccess.$inferSelect
export type NewTeamAppAccess = typeof teamAppAccess.$inferInsert
