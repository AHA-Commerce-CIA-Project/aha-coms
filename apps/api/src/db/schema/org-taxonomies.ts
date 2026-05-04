import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { identityUsers } from './identity-users'

export const orgTaxonomies = pgTable(
  'org_taxonomies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    taxonomyId: varchar('taxonomy_id', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => identityUsers.id),
  },
  (t) => [
    uniqueIndex('org_taxonomies_taxonomy_key_uniq').on(t.taxonomyId, t.key),
    index('org_taxonomies_taxonomy_id_idx').on(t.taxonomyId),
  ],
)

export type OrgTaxonomy = typeof orgTaxonomies.$inferSelect
export type NewOrgTaxonomy = typeof orgTaxonomies.$inferInsert
