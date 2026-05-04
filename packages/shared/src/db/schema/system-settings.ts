import { pgTable, uuid, varchar, jsonb, text, timestamp } from 'drizzle-orm/pg-core'
import { heroesProfiles } from './heroes-profiles'

export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => heroesProfiles.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
