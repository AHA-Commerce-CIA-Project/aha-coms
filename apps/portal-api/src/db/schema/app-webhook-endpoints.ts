import { pgTable, uuid, text, varchar, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { appRegistry } from './apps'

export const appWebhookEndpoints = pgTable(
  'app_webhook_endpoints',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    appId: uuid('app_id')
      .notNull()
      .references(() => appRegistry.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    // HMAC key stored as-is (not hashed — portal needs to sign outbound payloads with it)
    secret: text('secret').notNull(),
    subscribedEvents: jsonb('subscribed_events').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // 'active' | 'disabled'
    status: varchar('status', { length: 20 }).notNull().default('active'),
    failureCount: integer('failure_count').notNull().default(0),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastFailureReason: text('last_failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.appId, t.url)],
)

export const appWebhookEndpointsRelations = relations(appWebhookEndpoints, ({ one }) => ({
  app: one(appRegistry, {
    fields: [appWebhookEndpoints.appId],
    references: [appRegistry.id],
  }),
}))

export type AppWebhookEndpoint = typeof appWebhookEndpoints.$inferSelect
export type NewAppWebhookEndpoint = typeof appWebhookEndpoints.$inferInsert
