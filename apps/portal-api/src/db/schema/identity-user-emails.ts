import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const IDENTITY_USER_EMAIL_KINDS = ['workspace', 'personal'] as const
export type IdentityUserEmailKind = (typeof IDENTITY_USER_EMAIL_KINDS)[number]

export const IDENTITY_USER_EMAIL_ADDED_BY = ['admin', 'self', 'csv_import', 'sheet_sync', 'backfill', 'bootstrap'] as const
export type IdentityUserEmailAddedBy = (typeof IDENTITY_USER_EMAIL_ADDED_BY)[number]

export const identityUserEmails = pgTable(
  'identity_user_emails',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    identityUserId: uuid('identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    // email_normalized is a Postgres GENERATED ALWAYS AS column in prod
    // (lowercase + trim). The TS column here is plain varchar so Drizzle
    // models the select type. The .sql migration is the source of truth
    // for the GENERATED expression. Same pattern as user_aliases.alias_normalized.
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    addedBy: varchar('added_by', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('identity_user_emails_normalized_uniq').on(t.emailNormalized),
    uniqueIndex('identity_user_emails_one_primary_per_user_uniq')
      .on(t.identityUserId)
      .where(sql`${t.isPrimary} = true`),
    index('identity_user_emails_identity_user_id_idx').on(t.identityUserId),
    index('identity_user_emails_kind_idx').on(t.kind),
  ],
)

export type IdentityUserEmail = typeof identityUserEmails.$inferSelect
export type NewIdentityUserEmail = typeof identityUserEmails.$inferInsert
