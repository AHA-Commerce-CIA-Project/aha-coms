/**
 * Self-service personal-email management — PR D of Spec 06.
 *
 * Covers the user-side surface at POST/PATCH/DELETE /api/me/emails*. Admin
 * email management is in services/admin-emails.ts. Both services share the
 * collision check on identity_user_emails.email_normalized but differ in:
 *   - addedBy ('self' vs 'admin')
 *   - verifiedAt on insert (NULL — must verify via OTP — vs NOW() — admin trusted)
 *   - collision response shape (privacy-preserving vs reveals target user)
 *   - removal scope (cannot remove workspace-kind self-service)
 */

import { db } from '~/db'
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { identityUserEmails } from '~/db/schema/identity-user-emails'
import { requestOtp, verifyOtp } from './otp'

export type AddPersonalEmailResult =
  | { outcome: 'added'; emailId: string }
  | { outcome: 'email_in_use' }

export type VerifyOwnedEmailResult =
  | { outcome: 'verified' }
  | { outcome: 'not_owner' }
  | { outcome: 'email_not_found' }
  | { outcome: 'invalid_or_expired'; attemptsRemaining?: number }

export type ResendOwnedEmailOtpResult =
  | { outcome: 'sent' }
  | { outcome: 'already_verified' }
  | { outcome: 'rate_limited_email' }
  | { outcome: 'rate_limited_ip' }
  | { outcome: 'not_owner' }
  | { outcome: 'email_not_found' }

export type SetEmailPrimaryResult =
  | { outcome: 'set' }
  | { outcome: 'not_owner' }
  | { outcome: 'email_not_found' }
  | { outcome: 'not_verified' }

export type RemoveOwnedEmailResult =
  | { outcome: 'removed' }
  | { outcome: 'not_owner' }
  | { outcome: 'email_not_found' }
  | { outcome: 'last_verified_email' }
  | { outcome: 'workspace_kind_forbidden' }

/**
 * Insert a kind='personal' row for the current user and dispatch a verify-template
 * OTP. Privacy-preserving: collisions return a flat `email_in_use` outcome — the
 * route handler is responsible for producing a generic message that does NOT
 * reveal which identity owns the colliding row.
 */
export async function addPersonalEmail(args: {
  identityUserId: string
  email: string
  requestIp: string
}): Promise<AddPersonalEmailResult> {
  const emailNormalized = args.email.toLowerCase().trim()

  const collisions = await db
    .select({ id: identityUserEmails.id })
    .from(identityUserEmails)
    .where(eq(identityUserEmails.emailNormalized, emailNormalized))
    .limit(1)
  if (collisions.length > 0) return { outcome: 'email_in_use' }

  const inserted = await db
    .insert(identityUserEmails)
    .values({
      identityUserId: args.identityUserId,
      email: args.email,
      emailNormalized,
      kind: 'personal',
      isPrimary: false,
      verifiedAt: null,
      addedBy: 'self',
    })
    .returning({ id: identityUserEmails.id })
  const emailId = inserted[0]!.id

  // Fire the binding-OTP. Rate-limit/supersede semantics live inside requestOtp;
  // any 'rate_limited_*' outcome here just means the user must wait — the row
  // is already inserted and the verify endpoint will work as soon as a code is sent.
  await requestOtp({
    email: args.email,
    requestIp: args.requestIp,
    template: 'verify_personal_email',
  })

  return { outcome: 'added', emailId }
}

export async function verifyOwnedEmail(args: {
  identityUserId: string
  emailId: string
  code: string
}): Promise<VerifyOwnedEmailResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.identityUserId) return { outcome: 'not_owner' }

  // verifyOtp auto-sets verifiedAt on first successful match (otp.ts:284-289).
  const result = await verifyOtp({ email: row.email, code: args.code })
  if (result.outcome === 'inactive_user') {
    // Should not happen — caller is authenticated. Defensive.
    return { outcome: 'invalid_or_expired' }
  }
  if (result.outcome === 'invalid_or_expired') {
    return result.attemptsRemaining !== undefined
      ? { outcome: 'invalid_or_expired', attemptsRemaining: result.attemptsRemaining }
      : { outcome: 'invalid_or_expired' }
  }
  // Defense-in-depth: even though the OTP code was issued for row.email, confirm
  // the verifyOtp-resolved identityUserId matches the authenticated owner. Catches
  // any future routing mistake before granting verifiedAt.
  if (result.identityUserId !== args.identityUserId) return { outcome: 'not_owner' }
  return { outcome: 'verified' }
}

export async function resendOwnedEmailOtp(args: {
  identityUserId: string
  emailId: string
  requestIp: string
}): Promise<ResendOwnedEmailOtpResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.identityUserId) return { outcome: 'not_owner' }
  if (row.verifiedAt !== null) return { outcome: 'already_verified' }

  const otpResult = await requestOtp({
    email: row.email,
    requestIp: args.requestIp,
    template: 'verify_personal_email',
  })
  switch (otpResult.outcome) {
    case 'sent':
      return { outcome: 'sent' }
    case 'rate_limited_email':
      return { outcome: 'rate_limited_email' }
    case 'rate_limited_ip':
      return { outcome: 'rate_limited_ip' }
    default:
      // unknown_email and wrong_login_path are unreachable: the row exists with kind='personal'.
      return { outcome: 'sent' }
  }
}

export async function setEmailPrimary(args: {
  identityUserId: string
  emailId: string
}): Promise<SetEmailPrimaryResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.identityUserId) return { outcome: 'not_owner' }
  if (row.verifiedAt === null) return { outcome: 'not_verified' }
  if (row.isPrimary) return { outcome: 'set' } // idempotent

  // Demote prior primary in same transaction. The partial unique index
  // (one row WHERE isPrimary=true per user) requires the demotion BEFORE the
  // promotion, otherwise the constraint trips mid-transaction.
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(identityUserEmails)
      .set({ isPrimary: false, updatedAt: now })
      .where(
        and(
          eq(identityUserEmails.identityUserId, args.identityUserId),
          eq(identityUserEmails.isPrimary, true),
        ),
      )
    await tx
      .update(identityUserEmails)
      .set({ isPrimary: true, updatedAt: now })
      .where(eq(identityUserEmails.id, args.emailId))
  })
  return { outcome: 'set' }
}

/**
 * Self-service removal:
 *   - Cannot remove workspace-kind rows (admin-managed).
 *   - Cannot remove the only verified email on the identity (would lock the user out).
 *
 * Hard-delete; the DELETE trigger on identity_user_emails populates
 * identity_user_emails_history with removedReason='self_service'.
 */
export async function removeOwnedEmail(args: {
  identityUserId: string
  emailId: string
}): Promise<RemoveOwnedEmailResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.identityUserId) return { outcome: 'not_owner' }
  if (row.kind === 'workspace') return { outcome: 'workspace_kind_forbidden' }

  if (row.verifiedAt !== null) {
    const otherVerified = await db
      .select({ id: identityUserEmails.id })
      .from(identityUserEmails)
      .where(
        and(
          eq(identityUserEmails.identityUserId, args.identityUserId),
          isNotNull(identityUserEmails.verifiedAt),
          ne(identityUserEmails.id, args.emailId),
        ),
      )
      .limit(1)
    if (otherVerified.length === 0) return { outcome: 'last_verified_email' }
  }

  await db.delete(identityUserEmails).where(eq(identityUserEmails.id, args.emailId))
  return { outcome: 'removed' }
}
