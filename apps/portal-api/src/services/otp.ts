/**
 * OTP service — PR B1 of Spec 06 (Dual-Email Auth).
 *
 * Implements the request/verify flows defined in spec-06 §§433-476.
 *
 * Design notes:
 * - Rate-limit checks fire BEFORE the log write (locked decision Q9).
 * - No FK from otp_codes → identity_user_emails (Q7g enumeration resistance:
 *   codes can be issued to unknown emails; rate limits prevent abuse).
 * - timingSafeEqual is used for code comparison (constant-time for the match
 *   branch; timing of the hash step itself is not guarded — explicit out-of-
 *   scope decision per mission brief).
 * - verified_at on identity_user_emails is auto-set on first successful OTP
 *   (spec line 450, 474).
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '~/db'
import { otpCodes } from '~/db/schema/otp-codes'
import { otpRequestLog } from '~/db/schema/otp-request-log'
import { identityUserEmails } from '~/db/schema/identity-user-emails'
import { identityUsers } from '~/db/schema/identity-users'
import { sendMail } from '~/services/mail'
import { renderOtpEmail } from '~/services/mail/templates/otp'
import { renderVerifyPersonalEmail } from '~/services/mail/templates/verify-personal-email'

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const OTP_CODE_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_PER_EMAIL_COOLDOWN_SECONDS = 60
export const OTP_PER_IP_WINDOW_MINUTES = 60
export const OTP_PER_IP_MAX_REQUESTS = 30

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OtpTemplateKind = 'login' | 'verify_personal_email'

export type RequestOtpArgs = {
  email: string
  requestIp: string
  /**
   * Which mail template to send when a code is issued. Login is the default
   * (Workspace OIDC alternative); 'verify_personal_email' is used by the
   * self-service binding flow at POST /api/me/emails to confirm address ownership.
   * Branching, rate-limit, and supersede semantics are identical for both.
   */
  template?: OtpTemplateKind
  /**
   * Spec 06 PR F: if `true`, an identity with `password_set_at IS NOT NULL`
   * (but `password_only_auth = FALSE`) still receives an OTP code rather than
   * the `HAS_PASSWORD` short-circuit. Used by the login page's "Use code
   * instead" fallback link. Has no effect on PASSWORD_ONLY identities — they
   * always refuse OTP.
   */
  forceOtp?: boolean
  /** Clock injection for testing. Defaults to `() => new Date()`. */
  now?: () => Date
}

export type RequestOtpResult =
  | { outcome: 'sent' }
  | { outcome: 'rate_limited_email' }
  | { outcome: 'rate_limited_ip' }
  | { outcome: 'unknown_email' }
  | { outcome: 'wrong_login_path' }
  // Spec 06 PR F additions
  | { outcome: 'password_only' }
  | { outcome: 'has_password' }

export type VerifyOtpArgs = {
  email: string
  code: string
  /** Clock injection for testing. Defaults to `() => new Date()`. */
  now?: () => Date
}

export type VerifyOtpResult =
  | { outcome: 'verified'; identityUserId: string; emailRowId: string; emailNormalized: string }
  | { outcome: 'invalid_or_expired'; attemptsRemaining?: number }
  | { outcome: 'inactive_user' }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

function codesMatch(incoming: string, storedHex: string): boolean {
  const a = hexToBuffer(hashCode(incoming))
  const b = hexToBuffer(storedHex)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// requestOtp
// ---------------------------------------------------------------------------

export async function requestOtp(args: RequestOtpArgs): Promise<RequestOtpResult> {
  const { requestIp } = args
  const now = args.now ? args.now() : new Date()

  // Step 1: normalize email
  const emailNormalized = args.email.toLowerCase().trim()

  // Step 2a: per-email cooldown — COUNT(*) FROM otp_request_log WHERE email_normalized = $1
  //          AND requested_at > now() - 60s. If ≥ 1 → rate_limited_email.
  const cooldownCutoff = new Date(now.getTime() - OTP_PER_EMAIL_COOLDOWN_SECONDS * 1000)
  const [emailCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpRequestLog)
    .where(
      and(
        eq(otpRequestLog.emailNormalized, emailNormalized),
        gt(otpRequestLog.requestedAt, cooldownCutoff),
      ),
    )
  const emailRecentCount = Number(emailCountRow?.count ?? 0)
  if (emailRecentCount >= 1) {
    await logOutcome(emailNormalized, requestIp, 'rate_limited_email')
    return { outcome: 'rate_limited_email' }
  }

  // Step 2b: per-IP cap — COUNT(*) FROM otp_request_log WHERE request_ip = $1
  //          AND requested_at > now() - 60min. If ≥ 30 → rate_limited_ip.
  const ipWindowCutoff = new Date(now.getTime() - OTP_PER_IP_WINDOW_MINUTES * 60 * 1000)
  const [ipCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpRequestLog)
    .where(
      and(
        eq(otpRequestLog.requestIp, requestIp),
        gt(otpRequestLog.requestedAt, ipWindowCutoff),
      ),
    )
  const ipRecentCount = Number(ipCountRow?.count ?? 0)
  if (ipRecentCount >= OTP_PER_IP_MAX_REQUESTS) {
    await logOutcome(emailNormalized, requestIp, 'rate_limited_ip')
    return { outcome: 'rate_limited_ip' }
  }

  // Step 3: look up identity_user_emails (no kind or verified_at filter)
  const emailRows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.emailNormalized, emailNormalized))
    .limit(1)
  const emailRow = emailRows[0]

  // Step 4: branch on result
  if (!emailRow) {
    // No match — log and return (same shape as success for enumeration resistance)
    await logOutcome(emailNormalized, requestIp, 'unknown_email')
    return { outcome: 'unknown_email' }
  }

  if (emailRow.kind === 'workspace') {
    // User typed workspace email at OTP screen
    await logOutcome(emailNormalized, requestIp, 'wrong_login_path')
    return { outcome: 'wrong_login_path' }
  }

  // Spec 06 PR F: per-identity gates for password-bearing identities.
  // Look up the parent identity row to read password_only_auth + password_set_at.
  const ownerRows = await db
    .select({
      passwordOnlyAuth: identityUsers.passwordOnlyAuth,
      passwordSetAt: identityUsers.passwordSetAt,
    })
    .from(identityUsers)
    .where(eq(identityUsers.id, emailRow.identityUserId))
    .limit(1)
  const owner = ownerRows[0]

  if (owner?.passwordOnlyAuth === true) {
    // Admin-created credential bag — OTP is disabled for this identity.
    await logOutcome(emailNormalized, requestIp, 'password_only')
    return { outcome: 'password_only' }
  }

  // Password is set but the account is not password-only: caller may either
  // route the user to the password step OR pass forceOtp=true to fall back.
  if (owner?.passwordSetAt && !args.forceOtp) {
    await logOutcome(emailNormalized, requestIp, 'has_password')
    return { outcome: 'has_password' }
  }

  // kind === 'personal' (or any future personal-like kind)
  // Generate 6-digit code
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHash = hashCode(code)

  // Invalidate any prior live code for this email (supersede semantics, spec line 446)
  await db
    .update(otpCodes)
    .set({ invalidatedAt: now })
    .where(
      and(
        eq(otpCodes.emailNormalized, emailNormalized),
        isNull(otpCodes.consumedAt),
        isNull(otpCodes.invalidatedAt),
        gt(otpCodes.expiresAt, now),
      ),
    )

  // Insert new otp_codes row
  const expiresAt = new Date(now.getTime() + OTP_CODE_TTL_MINUTES * 60 * 1000)
  await db.insert(otpCodes).values({
    emailNormalized,
    codeHash,
    attemptsRemaining: OTP_MAX_ATTEMPTS,
    expiresAt,
    requestIp,
  })

  // Send email
  const template = args.template ?? 'login'
  const rendered =
    template === 'verify_personal_email'
      ? renderVerifyPersonalEmail({ code, ttlMinutes: OTP_CODE_TTL_MINUTES })
      : renderOtpEmail({ code, ttlMinutes: OTP_CODE_TTL_MINUTES })
  await sendMail({
    to: emailNormalized,
    subject: rendered.subject,
    textContent: rendered.textContent,
    htmlContent: rendered.htmlContent,
  })

  // Log outcome
  await logOutcome(emailNormalized, requestIp, 'sent')

  return { outcome: 'sent' }
}

// ---------------------------------------------------------------------------
// verifyOtp
// ---------------------------------------------------------------------------

export async function verifyOtp(args: VerifyOtpArgs): Promise<VerifyOtpResult> {
  const now = args.now ? args.now() : new Date()

  // Step 1: normalize email
  const emailNormalized = args.email.toLowerCase().trim()

  // Step 2: find a live code for this email
  //   WHERE email_normalized = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
  //   AND expires_at > now() ORDER BY created_at DESC LIMIT 1
  const codeRows = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.emailNormalized, emailNormalized),
        isNull(otpCodes.consumedAt),
        isNull(otpCodes.invalidatedAt),
        gt(otpCodes.expiresAt, now),
      ),
    )
    .orderBy(sql`${otpCodes.createdAt} DESC`)
    .limit(1)

  const codeRow = codeRows[0]

  // Step 3: no live code found
  if (!codeRow) {
    return { outcome: 'invalid_or_expired' }
  }

  // Step 4: compare codes in constant time
  if (!codesMatch(args.code, codeRow.codeHash)) {
    // Step 5: mismatch — decrement attempts
    const newAttempts = codeRow.attemptsRemaining - 1
    if (newAttempts <= 0) {
      // Exhausted — invalidate
      await db
        .update(otpCodes)
        .set({ attemptsRemaining: 0, invalidatedAt: now })
        .where(eq(otpCodes.id, codeRow.id))
    } else {
      await db
        .update(otpCodes)
        .set({ attemptsRemaining: newAttempts })
        .where(eq(otpCodes.id, codeRow.id))
    }
    return { outcome: 'invalid_or_expired', attemptsRemaining: newAttempts }
  }

  // Step 6: match — consume the code
  await db
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(eq(otpCodes.id, codeRow.id))

  // Look up email row + identity user (status check)
  const emailRows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.emailNormalized, emailNormalized))
    .limit(1)

  const emailRow = emailRows[0]
  if (!emailRow) {
    // Should not happen if requestOtp enforced existence, but guard defensively
    return { outcome: 'invalid_or_expired' }
  }

  const userRows = await db
    .select()
    .from(identityUsers)
    .where(eq(identityUsers.id, emailRow.identityUserId))
    .limit(1)

  const userRow = userRows[0]
  if (!userRow) {
    return { outcome: 'invalid_or_expired' }
  }

  // Status check — consume regardless (spec line 473-474)
  if (userRow.status !== 'active') {
    return { outcome: 'inactive_user' }
  }

  // Auto-verify email on first successful OTP (spec line 474)
  if (emailRow.verifiedAt === null) {
    await db
      .update(identityUserEmails)
      .set({ verifiedAt: now })
      .where(eq(identityUserEmails.id, emailRow.id))
  }

  return {
    outcome: 'verified',
    identityUserId: emailRow.identityUserId,
    emailRowId: emailRow.id,
    emailNormalized,
  }
}

// ---------------------------------------------------------------------------
// Internal log helper
// ---------------------------------------------------------------------------

async function logOutcome(
  emailNormalized: string | null,
  requestIp: string,
  outcome: string,
): Promise<void> {
  await db.insert(otpRequestLog).values({
    emailNormalized,
    requestIp,
    outcome,
  })
}
