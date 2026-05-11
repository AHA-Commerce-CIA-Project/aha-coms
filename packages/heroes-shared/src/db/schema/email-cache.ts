import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'

export const emailCache = pgTable('email_cache', {
  portalSub: uuid('portal_sub').primaryKey(),
  contactEmail: varchar('contact_email', { length: 255 }).notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
})
