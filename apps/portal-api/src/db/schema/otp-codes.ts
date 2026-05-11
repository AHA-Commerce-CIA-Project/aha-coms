import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),  // SHA-256 hex
    attemptsRemaining: integer('attempts_remaining').notNull().default(5),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
      // Set when superseded by a new code request for the same email.
    requestIp: varchar('request_ip', { length: 45 }),  // IPv6-safe length
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('otp_codes_email_idx').on(t.emailNormalized),
    index('otp_codes_expires_idx').on(t.expiresAt),
  ],
)

export type OtpCode = typeof otpCodes.$inferSelect
export type NewOtpCode = typeof otpCodes.$inferInsert
