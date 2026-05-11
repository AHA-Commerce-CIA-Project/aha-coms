import { pgTable, uuid, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const authHandoffs = pgTable('auth_handoffs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  codeHash: text('code_hash').notNull().unique(),
  appSlug: varchar('app_slug', { length: 50 }).notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => identityUsers.id, { onDelete: 'cascade' }),
  gipUid: text('gip_uid').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  portalRole: varchar('portal_role', { length: 20 }).notNull(),
  teamIds: jsonb('team_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  apps: jsonb('apps').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  redirectTo: text('redirect_to'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authHandoffsRelations = relations(authHandoffs, ({ one }) => ({
  user: one(identityUsers, {
    fields: [authHandoffs.userId],
    references: [identityUsers.id],
  }),
}))

export type AuthHandoff = typeof authHandoffs.$inferSelect
export type NewAuthHandoff = typeof authHandoffs.$inferInsert
