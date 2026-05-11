import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const pointCategories = pgTable('point_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  defaultName: varchar('default_name', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }),
  requiresScreenshot: boolean('requires_screenshot').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pointCategoryTranslations = pgTable(
  'point_category_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => pointCategories.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 10 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
  },
  (t) => [unique('uq_category_locale').on(t.categoryId, t.locale)],
)
