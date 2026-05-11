/**
 * One-time login link service — Spec 06 PR E §11.
 *
 * Sharp tool: a single-use token that mints an `admin_bypass` session for a target
 * user without going through email verification.  Restricted to super_admin issuance.
 * Used when a user has lost both email channels and no other recovery path remains.
 *
 * Security posture:
 *   - Token = `crypto.randomBytes(32).toString('base64url')` — 256 bits of entropy.
 *   - DB stores SHA-256 hash only; plaintext exists only in the URL the admin hands
 *     to the user out-of-band (chat, phone).
 *   - 5-minute TTL.  Single-use enforced via atomic UPDATE…WHERE consumed_at IS NULL
 *     RETURNING (race-safe under concurrent consume attempts).
 *   - Both issuance and consumption write `access_audit_log` rows with full reason
 *     and IP context.
 *   - Resulting session has `authMethod='admin_bypass'` with a 1-hour TTL (per Q-ttl
 *     in the spec — short-lived; this is a support hand-off tool, not durable access).
 */
import { createHash, randomBytes, randomUUID } from 'crypto'
import { eq, and, isNull, gt, sql } from 'drizzle-orm'
import { db } from '~/db'
import { oneTimeLoginLinks, identityUsers } from '~/db/schema'
import type { OneTimeLoginLinkReason } from '~/db/schema/one-time-login-links'
import { PORTAL_ORIGIN } from '~/config'
import { logger } from '~/logger'

const TOKEN_BYTES = 32
const TTL_MS = 5 * 60_000

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export interface IssueOneTimeLoginLinkArgs {
  targetIdentityUserId: string
  issuedBy: string
  reason: OneTimeLoginLinkReason
  reasonText: string | null
  requestIp: string | null
}

export interface IssueOneTimeLoginLinkResult {
  id: string
  url: string
  expiresAt: Date
}

export type ConsumeOneTimeLoginLinkResult =
  | {
      outcome: 'consumed'
      linkId: string
      targetIdentityUserId: string
      issuedBy: string
    }
  | { outcome: 'invalid' }
  | { outcome: 'expired' }
  | { outcome: 'already_used' }

/**
 * Mint a fresh one-time login link.  Caller is responsible for the super_admin gate
 * (the route layer does this via `requireSuperAdmin()` from middleware/rbac.ts) and
 * for verifying the target user exists.
 *
 * Returns the URL to deliver to the user out-of-band — plaintext token appears in
 * the URL once and is never persisted.
 */
export async function issueOneTimeLoginLink(
  args: IssueOneTimeLoginLinkArgs,
): Promise<IssueOneTimeLoginLinkResult> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const tokenHash = sha256Hex(token)
  const id = randomUUID()
  const expiresAt = new Date(Date.now() + TTL_MS)

  await db.insert(oneTimeLoginLinks).values({
    id,
    targetIdentityUserId: args.targetIdentityUserId,
    issuedBy: args.issuedBy,
    tokenHash,
    expiresAt,
    consumedAt: null,
    reason: args.reason,
    reasonText: args.reasonText,
    issuedFromIp: args.requestIp,
    consumedFromIp: null,
  })

  // Log only the link id, never the token.
  logger.info(
    { linkId: id, targetIdentityUserId: args.targetIdentityUserId, issuedBy: args.issuedBy, reason: args.reason },
    '[one-time-link] issued',
  )

  return {
    id,
    url: `${PORTAL_ORIGIN}/auth/one-time?token=${encodeURIComponent(token)}`,
    expiresAt,
  }
}

/**
 * Consume a one-time login link atomically.  Race-safe: the UPDATE…WHERE consumed_at
 * IS NULL ensures that two concurrent consume attempts cannot both see the row as
 * unused.  The first wins; the second falls through to `already_used`.
 *
 * Outcomes:
 *   `consumed`     — token valid, marked used, caller may mint admin_bypass session.
 *   `invalid`      — no row matched (wrong/missing token).
 *   `expired`      — row exists but expiresAt < now() at lookup time.
 *   `already_used` — row exists but consumed_at was non-null.
 */
export async function consumeOneTimeLoginLink(args: {
  token: string
  requestIp: string | null
}): Promise<ConsumeOneTimeLoginLinkResult> {
  const tokenHash = sha256Hex(args.token)
  const now = new Date()

  // Atomic single-use update: only flip consumed_at when it is currently NULL.
  const updated = await db
    .update(oneTimeLoginLinks)
    .set({ consumedAt: now, consumedFromIp: args.requestIp })
    .where(
      and(
        eq(oneTimeLoginLinks.tokenHash, tokenHash),
        isNull(oneTimeLoginLinks.consumedAt),
        gt(oneTimeLoginLinks.expiresAt, now),
      ),
    )
    .returning({
      id: oneTimeLoginLinks.id,
      targetIdentityUserId: oneTimeLoginLinks.targetIdentityUserId,
      issuedBy: oneTimeLoginLinks.issuedBy,
    })

  if (updated.length > 0) {
    const row = updated[0]!
    logger.info(
      { linkId: row.id, targetIdentityUserId: row.targetIdentityUserId },
      '[one-time-link] consumed',
    )
    return {
      outcome: 'consumed',
      linkId: row.id,
      targetIdentityUserId: row.targetIdentityUserId,
      issuedBy: row.issuedBy,
    }
  }

  // Update did not match — figure out why so the route can pick the right response.
  const existing = await db
    .select({
      id: oneTimeLoginLinks.id,
      consumedAt: oneTimeLoginLinks.consumedAt,
      expiresAt: oneTimeLoginLinks.expiresAt,
    })
    .from(oneTimeLoginLinks)
    .where(eq(oneTimeLoginLinks.tokenHash, tokenHash))
    .limit(1)

  if (existing.length === 0) return { outcome: 'invalid' }
  const row = existing[0]!
  if (row.consumedAt !== null) return { outcome: 'already_used' }
  return { outcome: 'expired' }
}

/**
 * Read-only history of one-time link issuances against a single user.  Powers the
 * audit table on the admin user-detail page (#7 of the UI surfaces).  Joined with
 * identity_users to render the issuing admin's name.
 */
export interface OneTimeLoginLinkHistoryRow {
  id: string
  issuedBy: { id: string; name: string }
  reason: string
  reasonText: string | null
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}

export async function listOneTimeLoginLinksForUser(
  targetIdentityUserId: string,
): Promise<OneTimeLoginLinkHistoryRow[]> {
  const rows = await db
    .select({
      id: oneTimeLoginLinks.id,
      issuedById: identityUsers.id,
      issuedByName: identityUsers.name,
      reason: oneTimeLoginLinks.reason,
      reasonText: oneTimeLoginLinks.reasonText,
      expiresAt: oneTimeLoginLinks.expiresAt,
      consumedAt: oneTimeLoginLinks.consumedAt,
      createdAt: oneTimeLoginLinks.createdAt,
    })
    .from(oneTimeLoginLinks)
    .innerJoin(identityUsers, eq(oneTimeLoginLinks.issuedBy, identityUsers.id))
    .where(eq(oneTimeLoginLinks.targetIdentityUserId, targetIdentityUserId))
    .orderBy(sql`${oneTimeLoginLinks.createdAt} DESC`)

  return rows.map((r) => ({
    id: r.id,
    issuedBy: { id: r.issuedById, name: r.issuedByName },
    reason: r.reason,
    reasonText: r.reasonText,
    expiresAt: r.expiresAt,
    consumedAt: r.consumedAt,
    createdAt: r.createdAt,
  }))
}
