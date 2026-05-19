/**
 * Portal-native session service (PR A of Spec 06 — Dual-Email Auth).
 *
 * Replaces the GIP session-cookie model with an opaque-UUID cookie whose value
 * is `auth_sessions.id`. GIP is retained solely as an OIDC verifier for
 * Google Workspace ID tokens (`verifyIdToken`).
 *
 * UUID generation: TS-side `crypto.randomUUID()` is used rather than relying
 * on the Postgres `gen_random_uuid()` column default. This lets us return the
 * session id to the caller without an extra `RETURNING` roundtrip.
 */

import { eq, and, isNull, isNotNull, ne, gt } from 'drizzle-orm'
import { db } from '~/db'
import { authSessions, identityUsers, sessionRevocations } from '~/db/schema'
import type { AuthMethod, SessionRevokedReason } from '~/db/schema'
import { logger } from '~/logger'
import { FORCE_PASSWORD_SETUP_ENABLED } from '~/config'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string             // identity_users.id
  sessionId: string      // auth_sessions.id
  gipUid: string | null
  name: string
  portalRole: 'employee' | 'admin' | 'super_admin'
  /**
   * Spec 06 PR F §1 — true when `identity_users.password_set_at IS NULL` AND
   * the `FORCE_PASSWORD_SETUP_ENABLED` env flag is on at session-mint time.
   * The portal-web (authed) layout reads this to gate every route except
   * `/onboarding/set-password`.
   */
  passwordSetupRequired: boolean
  // emails are NOT included here; they're resolved separately by /userinfo, /me etc.
  // teamIds and apps are also resolved by callers via existing services.
}

export interface CreatePortalSessionArgs {
  identityUserId: string
  authMethod: AuthMethod
  emailUsed: string | null
  request: Request
}

// ---------------------------------------------------------------------------
// TTL constants (Q-ttl, locked 2026-04-30)
// ---------------------------------------------------------------------------

export const SESSION_TTL_MS: Record<AuthMethod, number> = {
  workspace_oidc: 14 * 24 * 60 * 60 * 1000, // 14 days
  personal_otp: 14 * 24 * 60 * 60 * 1000,   // 14 days
  password: 14 * 24 * 60 * 60 * 1000,       // 14 days — same as OTP; Spec 06 PR F
  admin_bypass: 60 * 60 * 1000,              // 1 hour — short-lived; avoids lingering support sessions
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * UUID v4 format guard. Returns true if the string looks like a canonical
 * UUID (8-4-4-4-12 hex groups). Used to skip DB queries on garbage cookies.
 *
 * Using a strict v4 pattern (variant bits 8/9/a/b, version digit 4) so
 * that the Postgres gen_random_uuid() / crypto.randomUUID() output always
 * passes, while non-UUID strings fail fast.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Crude User-Agent → device label used internally by createPortalSession.
 * Delegates to the exported parseDeviceLabel below.
 */
function parseDeviceLabelInternal(ua: string | null): string {
  return parseDeviceLabel(ua)
}

/**
 * Truncate an IP address for display (active-sessions panel).  Last IPv4 octet → 'xxx';
 * last IPv6 group → 'xxxx'.  Preserves enough information for the user to recognise
 * "this is from my office network" without leaking the precise address to anyone with
 * access to a screenshot of the panel.
 */
export function truncateIpForDisplay(ip: string | null | undefined): string | null {
  if (!ip) return null
  if (ip.includes(':')) {
    const parts = ip.split(':')
    parts[parts.length - 1] = 'xxxx'
    return parts.join(':')
  }
  const parts = ip.split('.')
  if (parts.length === 4) {
    parts[3] = 'xxx'
    return parts.join('.')
  }
  return ip
}

/**
 * Extract the originating IP from proxy headers, falling back to null for
 * local dev environments that don't set forwarding headers.
 */
function extractIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip') ?? null
}

// ---------------------------------------------------------------------------
// createPortalSession
// ---------------------------------------------------------------------------

/**
 * Insert a new `auth_sessions` row and return the session id (the opaque
 * cookie value) plus its expiry time.
 *
 * UUID is generated in TS via `crypto.randomUUID()` so we can return it
 * without an extra `RETURNING id` roundtrip. Postgres `gen_random_uuid()`
 * column default is a safety net — it applies only if the `id` column is
 * omitted, which we never do here.
 */
export async function createPortalSession(args: CreatePortalSessionArgs): Promise<{
  sessionId: string
  expiresAt: Date
}> {
  const { identityUserId, authMethod, emailUsed, request } = args

  const sessionId = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS[authMethod])

  const ua = request.headers.get('user-agent')
  const deviceLabel = parseDeviceLabel(ua)
  const ipAddress = extractIp(request)

  await db.insert(authSessions).values({
    id: sessionId,
    identityUserId,
    authMethod,
    emailUsed,
    deviceLabel,
    ipAddress,
    expiresAt,
  })

  logger.info({ sessionId, identityUserId, authMethod }, '[sessions] created portal session')

  return { sessionId, expiresAt }
}

// ---------------------------------------------------------------------------
// validateSession
// ---------------------------------------------------------------------------

/**
 * Validate a session cookie value and return the resolved `SessionUser`, or
 * `null` if the session is invalid / expired / revoked.
 *
 * Five-step guard (per spec):
 *  1. UUID-format check — bail without DB query if not a UUID.
 *  2. PK lookup with inner-join on identity_users.
 *  3. Reject if revokedAt IS NOT NULL.
 *  4. Reject if expiresAt < now().
 *  5. Reject if identity_users.status != 'active'.
 *  6. Reject if a session_revocations row exists with notBefore >= session.createdAt
 *     (cheap indexed lookup — the "sign-out-everywhere" cutoff fast path).
 *
 * No columns are written on a successful validation (Q-lifecycle).
 */
export async function validateSession(sessionId: string): Promise<SessionUser | null> {
  // Step 1: UUID-format guard
  if (!isUuid(sessionId)) return null

  // Step 2: Single indexed PK lookup joined with identity_users
  const rows = await db
    .select({
      sessionId: authSessions.id,
      sessionCreatedAt: authSessions.createdAt,
      sessionExpiresAt: authSessions.expiresAt,
      sessionRevokedAt: authSessions.revokedAt,
      identityUserId: identityUsers.id,
      gipUid: identityUsers.gipUid,
      name: identityUsers.name,
      portalRole: identityUsers.portalRole,
      identityStatus: identityUsers.status,
      passwordSetAt: identityUsers.passwordSetAt,
    })
    .from(authSessions)
    .innerJoin(identityUsers, eq(authSessions.identityUserId, identityUsers.id))
    .where(eq(authSessions.id, sessionId))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  // Step 3: per-row revokedAt
  if (row.sessionRevokedAt !== null) return null

  // Step 4: expiry
  if (row.sessionExpiresAt < new Date()) return null

  // Step 5: user must be active
  if (row.identityStatus !== 'active') return null

  // Step 6: session_revocations cutoff check.
  // A row with notBefore >= session.createdAt means a "sign-out-everywhere"
  // was issued after this session was created — the session is dead.
  const cutoffRows = await db
    .select({ id: sessionRevocations.id })
    .from(sessionRevocations)
    .where(
      and(
        eq(sessionRevocations.userId, row.identityUserId),
        gt(sessionRevocations.notBefore, row.sessionCreatedAt),
      ),
    )
    .limit(1)

  if (cutoffRows.length > 0) return null

  return {
    id: row.identityUserId,
    sessionId: row.sessionId,
    gipUid: row.gipUid ?? null,
    name: row.name,
    portalRole: row.portalRole as SessionUser['portalRole'],
    passwordSetupRequired: FORCE_PASSWORD_SETUP_ENABLED && row.passwordSetAt === null,
  }
}

// ---------------------------------------------------------------------------
// revokeSession
// ---------------------------------------------------------------------------

/**
 * Revoke a single session by id.
 * Used for: current-session logout (action A), per-device sign-out (action B),
 * and single-session admin revoke.
 *
 * Idempotent: the `revokedAt IS NULL` guard means double-calling is safe.
 */
export async function revokeSession(
  sessionId: string,
  reason: SessionRevokedReason,
): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)))

  logger.info({ sessionId, reason }, '[sessions] revoked single session')
}

// ---------------------------------------------------------------------------
// revokeAllSessionsForUser
// ---------------------------------------------------------------------------

/**
 * Bulk-revoke all active sessions for a user.
 *
 * `exceptSessionId` keeps the caller's own session alive (action C — "sign out
 * all other devices").
 *
 * For admin-initiated reasons (admin_revoke, status_change) ALSO inserts a
 * `session_revocations` cutoff row so `validateSession` short-circuits without
 * having to scan all `auth_sessions` rows (fast-path for the fanout case).
 */
export async function revokeAllSessionsForUser(args: {
  userId: string
  reason: SessionRevokedReason
  exceptSessionId?: string
}): Promise<void> {
  const { userId, reason, exceptSessionId } = args

  const conditions = [
    eq(authSessions.identityUserId, userId),
    isNull(authSessions.revokedAt),
  ]
  if (exceptSessionId) {
    conditions.push(ne(authSessions.id, exceptSessionId))
  }

  await db
    .update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(...conditions))

  logger.info({ userId, reason, exceptSessionId }, '[sessions] bulk-revoked sessions for user')

  // For admin/deactivation paths also insert the cutoff row for fast-path
  // validation. This means validateSession can short-circuit without reading
  // N auth_sessions rows when the user has many sessions.
  if (reason === 'admin_revoke' || reason === 'status_change') {
    // Look up gipUid for the session_revocations insert (existing schema has
    // gipUid NOT NULL — see TODO below).
    const userRow = await db
      .select({ gipUid: identityUsers.gipUid })
      .from(identityUsers)
      .where(eq(identityUsers.id, userId))
      .limit(1)

    const gipUid = userRow[0]?.gipUid ?? null
    await insertSessionCutoff(userId, gipUid, reason)
  }
}

// ---------------------------------------------------------------------------
// insertSessionCutoff
// ---------------------------------------------------------------------------

/**
 * Insert a `session_revocations` cutoff row for a user.
 *
 * `notBefore = NOW()` — any session with `createdAt <= notBefore` will be
 * rejected by `validateSession` step 6 without a per-row auth_sessions read.
 *
 * `gipUid` is required NOT NULL by the current `session_revocations` schema.
 * OTP-only users (no GIP account) pass an empty string `''` to satisfy the
 * constraint without a schema change.
 *
 * TODO (follow-up migration): make `session_revocations.gip_uid` nullable.
 * OTP-only employees have no GIP uid; forcing '' is a workaround that keeps
 * this PR's schema surface minimal. Remove the `?? ''` coercion and the
 * `gipUid` parameter once the column is nullable.
 */
export async function insertSessionCutoff(
  userId: string,
  gipUid: string | null,
  reason: SessionRevokedReason,
): Promise<void> {
  const now = new Date()

  await db.insert(sessionRevocations).values({
    userId,
    gipUid: gipUid ?? '', // '' for OTP-only users — see TODO above
    reason,
    revokedAt: now,
    notBefore: now,
  })

  logger.info({ userId, reason }, '[sessions] inserted session cutoff row')
}

// ---------------------------------------------------------------------------
// listActiveSessionsForUser — Spec 06 PR E §10
// ---------------------------------------------------------------------------

export interface ActiveSessionRow {
  id: string
  authMethod: AuthMethod
  deviceLabel: string | null
  ipAddress: string | null
  createdAt: Date
  expiresAt: Date
}

/**
 * List active (not-revoked, not-expired) sessions for a user, newest first.  Used by
 * the profile active-sessions panel.  Note: this does NOT consult `session_revocations`
 * cutoff rows because the per-row `revokedAt` is set whenever a cutoff is issued by the
 * admin path (see `revokeAllSessionsForUser` for `admin_revoke` / `status_change` —
 * both write per-row UPDATE alongside the cutoff insert).
 */
export async function listActiveSessionsForUser(userId: string): Promise<ActiveSessionRow[]> {
  const rows = await db
    .select({
      id: authSessions.id,
      authMethod: authSessions.authMethod,
      deviceLabel: authSessions.deviceLabel,
      ipAddress: authSessions.ipAddress,
      createdAt: authSessions.createdAt,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.identityUserId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )

  return rows
    .map((r) => ({
      id: r.id,
      authMethod: r.authMethod as AuthMethod,
      deviceLabel: r.deviceLabel,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * Look up a single active session row owned by the given user.  Used by the per-row
 * delete handler to enforce ownership: a user cannot revoke another user's session id
 * even if they happen to know it.  Returns null for revoked, expired, missing, or
 * cross-user rows so the caller can respond with a uniform 404 (no leak that the row
 * exists under a different owner).
 */
export async function getOwnedSession(
  userId: string,
  sessionId: string,
): Promise<{ id: string } | null> {
  if (!isUuid(sessionId)) return null
  const rows = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, sessionId),
        eq(authSessions.identityUserId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// parseDeviceLabel (exported — used by OTP verify route to populate deviceLabel)
// ---------------------------------------------------------------------------

/**
 * Parses a User-Agent header into a short device label for the active-sessions panel.
 * Examples: "Mac · Safari 18", "Windows · Chrome 130", "iPhone · Safari", "Linux · Firefox".
 * Falls back to "Unknown device" if UA is empty or unrecognizable.
 *
 * Note: a simpler `parseDeviceLabel` exists as a private helper above. This
 * exported version adds major-version numbers and a wider browser/OS coverage
 * table. The private helper is retained for `createPortalSession` (no breaking
 * change); callers that need the richer label (e.g. the OTP verify route) use
 * this export.
 */
export function parseDeviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'

  // OS detection — order matters: iPhone/iPad before Mac (iPhone UA contains "Mac OS X")
  let os = 'Unknown'
  if (/iPhone/i.test(userAgent)) os = 'iPhone'
  else if (/iPad/i.test(userAgent)) os = 'iPad'
  else if (/Mac OS X|Macintosh/i.test(userAgent)) os = 'Mac'
  else if (/Windows/i.test(userAgent)) os = 'Windows'
  else if (/Android/i.test(userAgent)) os = 'Android'
  else if (/Linux/i.test(userAgent)) os = 'Linux'

  // Browser detection — order matters:
  //   Edge before Chrome (Edge UA contains "Chrome")
  //   Chrome before Safari (Chrome UA contains "Safari")
  let browser = 'Unknown'
  let version = ''
  const m = (re: RegExp) => userAgent.match(re)
  const edgeM = m(/Edg\/(\d+)/)
  const firefoxM = m(/Firefox\/(\d+)/)
  const chromeM = m(/Chrome\/(\d+)/)
  const versionSafariM = m(/Version\/(\d+).*Safari/)
  const safariM = m(/Safari\/(\d+)/)
  if (edgeM) { browser = 'Edge'; version = edgeM[1] }
  else if (firefoxM) { browser = 'Firefox'; version = firefoxM[1] }
  else if (chromeM) { browser = 'Chrome'; version = chromeM[1] }
  else if (versionSafariM) { browser = 'Safari'; version = versionSafariM[1] }
  else if (safariM) { browser = 'Safari'; version = safariM[1] }

  if (os === 'Unknown' && browser === 'Unknown') return 'Unknown device'
  return `${os} · ${browser}${version ? ' ' + version : ''}`.trim()
}
