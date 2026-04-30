import { eq, inArray } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, sessionRevocations, teamMembers, teamAppAccess, appRegistry } from '~/db/schema'
import { revokeRefreshTokens } from '../gip-admin'
import { dispatchPortalWebhook } from './portal-webhook-fanout'
import { getDisplayEmail } from './email-resolution'
import type { SessionRevokedPayload } from '@coms-portal/shared'
import { logger } from '~/logger'

export type RevocationReason = SessionRevokedPayload['reason']
// = 'logout' | 'status_change' | 'offboarded' | 'admin'

/**
 * Resolve the set of app slugs a user has access to via their team memberships.
 * Mirrors the logic in resolveAndSyncClaims (services/claims.ts) but returns only slugs
 * without pushing to GIP — keeping it side-effect free for callers that just need the list.
 */
export async function listAppSlugsForUser(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))

  const teamIds = memberships.map((m) => m.teamId)
  if (teamIds.length === 0) return []

  const access = await db
    .select({ appId: teamAppAccess.appId })
    .from(teamAppAccess)
    .where(inArray(teamAppAccess.teamId, teamIds))

  const appIds = [...new Set(access.map((a) => a.appId))]
  if (appIds.length === 0) return []

  const apps = await db
    .select({ slug: appRegistry.slug })
    .from(appRegistry)
    .where(inArray(appRegistry.id, appIds))

  return apps.map((a) => a.slug)
}

/**
 * Revoke all portal sessions for a user.
 *
 *  - Writes a row into session_revocations with notBefore = now().
 *  - Calls GIP revokeRefreshTokens(gipUid) to invalidate Firebase refresh tokens.
 *  - Fans out a session.revoked webhook to every app the user has access to
 *    (endpoints subscribed to 'session.revoked' and whose app is in the user's apps list).
 *
 * Best-effort on all three side effects — if any one fails, log but do not abort.
 * Returns { revokedAt: Date } so callers can include it in responses.
 */
export async function revokePortalSession(input: {
  userId: string
  reason: RevocationReason
}): Promise<{ revokedAt: Date }> {
  const { userId, reason } = input

  // Look up the user — throw if not found; callers always pass a known id.
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (!user) {
    throw new Error(`revokePortalSession: user ${userId} not found`)
  }

  const revokedAt = new Date()
  const notBefore = revokedAt

  // 1. Write revocation record
  try {
    await db.insert(sessionRevocations).values({
      userId: user.id,
      gipUid: user.gipUid ?? '',
      reason,
      revokedAt,
      notBefore,
    })
  } catch (err) {
    logger.error({ err }, '[session-revocation] failed to write session_revocations row')
    // Still proceed — GIP revoke and webhook fanout are more important for security.
  }

  // 2. Revoke GIP refresh tokens (best-effort)
  if (user.gipUid) {
    try {
      await revokeRefreshTokens(user.gipUid)
    } catch (err) {
      logger.error({ err, gipUid: user.gipUid }, '[session-revocation] revokeRefreshTokens failed')
    }
  }

  // 3. Fan out session.revoked webhook to all apps the user has access to
  try {
    const appSlugs = await listAppSlugsForUser(userId)

    if (appSlugs.length > 0) {
      // Resolve display email per Q8a for webhook payload
      const displayEmail = await getDisplayEmail(userId)
      const payload: SessionRevokedPayload = {
        userId: user.id,
        gipUid: user.gipUid ?? '',
        email: displayEmail ?? '',
        reason,
        notBefore: notBefore.toISOString(),
      }

      await dispatchPortalWebhook('session.revoked', payload, { appSlugs })
    }
  } catch (err) {
    logger.error({ err }, '[session-revocation] webhook dispatch failed')
  }

  return { revokedAt }
}
