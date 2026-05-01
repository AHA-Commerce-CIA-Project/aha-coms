import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const OTP_REQUEST_OUTCOMES = [
  'sent',
  'rate_limited_email',
  'rate_limited_ip',
  'unknown_email',
  'wrong_login_path',
] as const
export type OtpRequestOutcome = (typeof OTP_REQUEST_OUTCOMES)[number]

export const otpRequestLog = pgTable(
  'otp_request_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    emailNormalized: varchar('email_normalized', { length: 255 }),  // null = unknown email path
    requestIp: varchar('request_ip', { length: 45 }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: varchar('outcome', { length: 20 }).notNull(),
      // 'sent' | 'rate_limited_email' | 'rate_limited_ip' | 'unknown_email' | 'wrong_login_path'
  },
  (t) => [
    index('otp_request_log_email_time_idx').on(t.emailNormalized, t.requestedAt),
    index('otp_request_log_ip_time_idx').on(t.requestIp, t.requestedAt),
  ],
)

export type OtpRequestLog = typeof otpRequestLog.$inferSelect
export type NewOtpRequestLog = typeof otpRequestLog.$inferInsert
