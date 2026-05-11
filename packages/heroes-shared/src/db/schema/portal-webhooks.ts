import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const portalWebhookEvents = pgTable('portal_webhook_events', {
  eventId: text('event_id').primaryKey(),
  receivedAt: timestamp('received_at').notNull().defaultNow(),
})
