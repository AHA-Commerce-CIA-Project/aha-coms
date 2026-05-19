/**
 * Password sign-in service — Spec 06 PR F §4.
 *
 * Wraps GIP `signInWithPassword` with portal-side gates:
 *   - per-email rate limit: 5 attempts/min (recorded via otp_request_log)
 *   - per-IP rate limit: 30 attempts/min
 *   - lockout: after 5 FAILED attempts on the same email within 10 min,
 *     lock for 15 min via identity_users.password_lockout_until
 *   - inactive-user gate: identity_users.status !== 'active' → INACTIVE_USER
 *
 * Outcomes mirror OTP's discriminated-union shape.
 */

import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, identityUserEmails, otpRequestLog } from '~/db/schema'
import { signInWithPassword, GipSignInError } from '../gip-admin'
import { logger } from '~/logger'

// ---------------------------------------------------------------------------
// Public constants — keep aligned with spec §4
// ---------------------------------------------------------------------------

export const PASSWORD_PER_EMAIL_WINDOW_SECONDS = 60
export const PASSWORD_PER_EMAIL_MAX = 5
export const PASSWORD_PER_IP_WINDOW_SECONDS = 60
export const PASSWORD_PER_IP_MAX = 30
export const PASSWORD_LOCKOUT_FAILURE_WINDOW_MINUTES = 10
export const PASSWORD_LOCKOUT_FAILURE_THRESHOLD = 5
export const PASSWORD_LOCKOUT_DURATION_MINUTES = 15

// otp_request_log.outcome literals used to record password-sign-in attempts.
// We reuse the existing table to avoid a parallel password-attempt log — the
// rate-limit math only needs an indexed (email_normalised, requested_at, outcome)
// tuple, which otp_request_log already provides.
const PASSWORD_OUTCOMES = {
  attempt: 'password_attempt',
  failure: 'password_failure',
  success: 'password_success',
  rate_limited_email: 'password_rate_limited_email',
  rate_limited_ip: 'password_rate_limited_ip',
  lockout: 'password_lockout',
} as const

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AttemptPasswordSignInArgs = {
  email: string
  password: string
  requestIp: string
  /** Clock injection for testing. Defaults to `() => new Date()`. */
  now?: () => Date
}

export type AttemptPasswordSignInResult =
  | { outcome: 'signed_in'; identityUserId: string; emailNormalized: string }
  | { outcome: 'invalid_credentials' }
  | { outcome: 'inactive_user' }
  | { outcome: 'rate_limited_email'; retryAfterSeconds: number }
  | { outcome: 'rate_limited_ip' }
  | { outcome: 'locked_out'; retryAfterSeconds: number }

// ---------------------------------------------------------------------------
// attemptPasswordSignIn
// ---------------------------------------------------------------------------

export async function attemptPasswordSignIn(
  args: AttemptPasswordSignInArgs,
): Promise<AttemptPasswordSignInResult> {
  const now = args.now ? args.now() : new Date()
  const emailNormalized = args.email.toLowerCase().trim()

  // 1) per-email rate limit (window: PASSWORD_PER_EMAIL_WINDOW_SECONDS)
  const perEmailCutoff = new Date(now.getTime() - PASSWORD_PER_EMAIL_WINDOW_SECONDS * 1000)
  const [emailCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpRequestLog)
    .where(
      and(
        eq(otpRequestLog.emailNormalized, emailNormalized),
        gt(otpRequestLog.requestedAt, perEmailCutoff),
        // Only attempts (not success/lockout/etc) count toward the per-window cap.
        eq(otpRequestLog.outcome, PASSWORD_OUTCOMES.attempt),
      ),
    )
  if (Number(emailCountRow?.count ?? 0) >= PASSWORD_PER_EMAIL_MAX) {
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.rate_limited_email)
    return { outcome: 'rate_limited_email', retryAfterSeconds: PASSWORD_PER_EMAIL_WINDOW_SECONDS }
  }

  // 2) per-IP rate limit
  const perIpCutoff = new Date(now.getTime() - PASSWORD_PER_IP_WINDOW_SECONDS * 1000)
  const [ipCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpRequestLog)
    .where(
      and(
        eq(otpRequestLog.requestIp, args.requestIp),
        gt(otpRequestLog.requestedAt, perIpCutoff),
        eq(otpRequestLog.outcome, PASSWORD_OUTCOMES.attempt),
      ),
    )
  if (Number(ipCountRow?.count ?? 0) >= PASSWORD_PER_IP_MAX) {
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.rate_limited_ip)
    return { outcome: 'rate_limited_ip' }
  }

  // 3) Lookup the identity row up front — we need it for the lockout check,
  // the inactive-user gate, and the post-sign-in session mint.
  const emailRow = await db.query.identityUserEmails.findFirst({
    where: eq(identityUserEmails.emailNormalized, emailNormalized),
    columns: { identityUserId: true },
  })

  // Record the attempt regardless of whether the email is known — keeps the
  // rate-limit math accurate against enumeration-style probes.
  await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.attempt)

  if (!emailRow) {
    // Unknown email — let GIP own the constant-time "wrong creds" response
    // when it can; otherwise return invalid_credentials directly.
    try {
      await signInWithPassword(args.email, args.password)
    } catch {
      // Always falls through to invalid_credentials — even if GIP somehow
      // accepted (it won't for an email we don't have), we have no local
      // identity to mint a session for.
    }
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.failure)
    return { outcome: 'invalid_credentials' }
  }

  const identityUser = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, emailRow.identityUserId),
  })
  if (!identityUser) {
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.failure)
    return { outcome: 'invalid_credentials' }
  }

  // 4) Lockout gate
  if (
    identityUser.passwordLockoutUntil &&
    identityUser.passwordLockoutUntil > now
  ) {
    const retryAfterSeconds = Math.ceil(
      (identityUser.passwordLockoutUntil.getTime() - now.getTime()) / 1000,
    )
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.lockout)
    return { outcome: 'locked_out', retryAfterSeconds }
  }

  // 5) Inactive-user gate (runs BEFORE GIP — no point spending a round-trip)
  if (identityUser.status !== 'active') {
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.failure)
    return { outcome: 'inactive_user' }
  }

  // 6) GIP sign-in
  try {
    await signInWithPassword(args.email, args.password)
  } catch (err) {
    if (err instanceof GipSignInError) {
      if (err.detail.code === 'USER_DISABLED') {
        await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.failure)
        return { outcome: 'inactive_user' }
      }
      // INVALID_CREDENTIALS / INVALID_EMAIL / UNKNOWN — treat all as bad creds
      // from the user's perspective, but log UNKNOWN at warn so operators see it.
      if (err.detail.code === 'UNKNOWN') {
        logger.warn({ raw: err.detail.raw }, '[password-signin] unknown GIP error')
      }
    } else {
      // Non-GipSignInError — likely a network blip; re-throw so the API onError
      // handler logs it. Client gets the generic 500.
      throw err
    }
    await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.failure)
    await maybeApplyLockout({ identityUserId: identityUser.id, emailNormalized, now })
    return { outcome: 'invalid_credentials' }
  }

  // 7) Success — clear any pending lockout and log
  if (identityUser.passwordLockoutUntil !== null) {
    await db
      .update(identityUsers)
      .set({ passwordLockoutUntil: null, updatedAt: now })
      .where(eq(identityUsers.id, identityUser.id))
  }
  await logOutcome(emailNormalized, args.requestIp, PASSWORD_OUTCOMES.success)

  return {
    outcome: 'signed_in',
    identityUserId: identityUser.id,
    emailNormalized,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function logOutcome(
  emailNormalized: string,
  requestIp: string,
  outcome: string,
): Promise<void> {
  await db.insert(otpRequestLog).values({
    emailNormalized,
    requestIp,
    outcome,
  })
}

/**
 * Apply the lockout if the failure window threshold has been crossed.
 *
 * Counts failed attempts in the last PASSWORD_LOCKOUT_FAILURE_WINDOW_MINUTES;
 * if >= threshold, sets password_lockout_until = now + duration.
 */
async function maybeApplyLockout(args: {
  identityUserId: string
  emailNormalized: string
  now: Date
}): Promise<void> {
  const cutoff = new Date(
    args.now.getTime() - PASSWORD_LOCKOUT_FAILURE_WINDOW_MINUTES * 60 * 1000,
  )
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpRequestLog)
    .where(
      and(
        eq(otpRequestLog.emailNormalized, args.emailNormalized),
        gt(otpRequestLog.requestedAt, cutoff),
        eq(otpRequestLog.outcome, PASSWORD_OUTCOMES.failure),
      ),
    )
  const failures = Number(row?.count ?? 0)
  if (failures < PASSWORD_LOCKOUT_FAILURE_THRESHOLD) return

  const lockoutUntil = new Date(
    args.now.getTime() + PASSWORD_LOCKOUT_DURATION_MINUTES * 60 * 1000,
  )
  await db
    .update(identityUsers)
    .set({ passwordLockoutUntil: lockoutUntil, updatedAt: args.now })
    .where(eq(identityUsers.id, args.identityUserId))
}
