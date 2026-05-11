import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { appWebhookEndpoints } from './app-webhook-endpoints'

export const webhookDeliveryJobs = pgTable(
  'webhook_delivery_jobs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => appWebhookEndpoints.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 64 }).notNull(),
    eventId: uuid('event_id').notNull(),
    // The signed envelope body as sent to the endpoint (raw JSON string).
    // Stored verbatim because the HMAC signature is computed over the exact byte
    // sequence — regenerating JSON could produce a different key order and break
    // signature verification on the receiving end.
    jsonBody: text('json_body').notNull(),
    // occurredAt timestamp used in the HMAC signature — must be preserved verbatim.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    // 'pending' | 'running' | 'completed' | 'failed'
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    lastError: text('last_error'),
    // Identifies which worker instance holds the lock on a running job.
    lockedBy: varchar('locked_by', { length: 64 }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite index used by the poll query: filter by status, order by nextAttemptAt.
    index('webhook_delivery_jobs_poll_idx').on(t.status, t.nextAttemptAt),
  ],
)

export type WebhookDeliveryJob = typeof webhookDeliveryJobs.$inferSelect
export type NewWebhookDeliveryJob = typeof webhookDeliveryJobs.$inferInsert
