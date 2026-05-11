import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import type { PortalSessionUser } from '@coms-portal/sdk'
import { db } from '../db'
import { authSession, emailCache, heroesProfiles } from '../db/schema'

export type { PortalSessionUser }

export const PORTAL_SESSION_COOKIE = 'coms_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export class PortalSessionDeniedError extends Error {
  constructor(public readonly portalSub: string) {
    super(`No heroes account for ${portalSub}`)
    this.name = 'PortalSessionDeniedError'
  }
}

export type LocalSessionRecord = {
  sessionId: string
  userId: string
  expiresAt: Date
  email: string
  portalRole: string
  apps: string[]
}

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

function generateSessionId(): string {
  return randomBytes(16).toString('hex')
}

export async function createLocalSessionForPortalUser(
  portalUser: PortalSessionUser,
): Promise<{ token: string; expiresAt: Date }> {
  await db
    .insert(heroesProfiles)
    .values({
      id: portalUser.id,
      name: portalUser.name,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: heroesProfiles.id,
      set: {
        name: portalUser.name,
        isActive: true,
        updatedAt: new Date(),
      },
    })

  if (portalUser.email) {
    await db
      .insert(emailCache)
      .values({
        portalSub: portalUser.id,
        contactEmail: portalUser.email,
      })
      .onConflictDoUpdate({
        target: emailCache.portalSub,
        set: { contactEmail: portalUser.email, cachedAt: new Date() },
      })
  }

  const token = generateToken()
  const sessionId = generateSessionId()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

  await db.insert(authSession).values({
    id: sessionId,
    token,
    userId: portalUser.id,
    expiresAt,
    portalRole: portalUser.portalRole,
    apps: portalUser.apps,
  })

  return { token, expiresAt }
}

export async function getLocalSessionByToken(
  token: string,
): Promise<LocalSessionRecord | null> {
  const [row] = await db
    .select({
      sessionId: authSession.id,
      userId: authSession.userId,
      expiresAt: authSession.expiresAt,
      portalRole: authSession.portalRole,
      apps: authSession.apps,
      contactEmail: emailCache.contactEmail,
    })
    .from(authSession)
    .leftJoin(emailCache, eq(emailCache.portalSub, authSession.userId))
    .where(eq(authSession.token, token))
    .limit(1)

  if (!row) return null
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(authSession).where(eq(authSession.token, token))
    return null
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    expiresAt: row.expiresAt,
    email: row.contactEmail ?? '',
    portalRole: row.portalRole,
    apps: row.apps,
  }
}

export async function destroyLocalSessionByToken(token: string): Promise<void> {
  await db.delete(authSession).where(eq(authSession.token, token))
}

export async function destroySessionsForPortalSub(portalSub: string): Promise<number> {
  const deleted = await db
    .delete(authSession)
    .where(eq(authSession.userId, portalSub))
    .returning({ id: authSession.id })
  return deleted.length
}

export function readSessionCookieFromHeaders(headers: Headers): string | null {
  const raw = headers.get('cookie')
  if (!raw) return null
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq) === PORTAL_SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1))
    }
  }
  return null
}
