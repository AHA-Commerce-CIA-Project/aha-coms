import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { authSession, authUser, users, userEmails } from '../db/schema'
import type { PortalSessionUser } from '@coms-portal/shared/contracts/auth'

export type { PortalSessionUser }

export const PORTAL_SESSION_COOKIE = 'coms_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export class PortalSessionDeniedError extends Error {
  constructor(public readonly email: string) {
    super(`No heroes account for ${email}`)
    this.name = 'PortalSessionDeniedError'
  }
}

// Lazy db getter — keeps the postgres client from being instantiated during
// SvelteKit's build-time analyse pass when DATABASE_URL is undefined.
async function getDb() {
  const mod = await import('../db')
  return mod.db
}

async function findAppUserByEmail(email: string) {
  const db = await getDb()
  const [primary] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (primary) return primary

  const [secondary] = await db
    .select({ userId: userEmails.userId })
    .from(userEmails)
    .where(eq(userEmails.email, email))
    .limit(1)
  if (!secondary) return null

  const [linked] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, secondary.userId))
    .limit(1)
  return linked ?? null
}

export async function createLocalSessionForPortalUser(portalUser: PortalSessionUser): Promise<{
  token: string
  expiresAt: Date
}> {
  const appUser = await findAppUserByEmail(portalUser.email)
  if (!appUser) throw new PortalSessionDeniedError(portalUser.email)

  const db = await getDb()
  const [existing] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.email, appUser.email))
    .limit(1)

  let authUserId = existing?.id
  if (!authUserId) {
    authUserId = portalUser.id
    await db.insert(authUser).values({
      id: authUserId,
      name: portalUser.name || appUser.name,
      email: appUser.email,
      emailVerified: true,
    })
  }

  const token = randomBytes(48).toString('base64url')
  const sessionId = randomBytes(16).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

  await db.insert(authSession).values({
    id: sessionId,
    token,
    userId: authUserId,
    expiresAt,
    portalRole: portalUser.portalRole,
    apps: portalUser.apps,
  })

  return { token, expiresAt }
}

export async function destroyLocalSessionByToken(token: string): Promise<void> {
  const db = await getDb()
  await db.delete(authSession).where(eq(authSession.token, token))
}

export type LocalSessionRecord = {
  sessionId: string
  userId: string
  expiresAt: Date
  email: string
  portalRole: string
  apps: string[]
}

export async function getLocalSessionByToken(token: string): Promise<LocalSessionRecord | null> {
  const db = await getDb()
  const [row] = await db
    .select({
      sessionId: authSession.id,
      userId: authSession.userId,
      expiresAt: authSession.expiresAt,
      email: authUser.email,
      portalRole: authSession.portalRole,
      apps: authSession.apps,
    })
    .from(authSession)
    .innerJoin(authUser, eq(authSession.userId, authUser.id))
    .where(eq(authSession.token, token))
    .limit(1)

  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await destroyLocalSessionByToken(token)
    return null
  }
  return row
}

export async function destroySessionsForUserEmail(email: string): Promise<number> {
  const appUser = await findAppUserByEmail(email)
  if (!appUser) return 0

  const db = await getDb()
  const [authUserRow] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.email, appUser.email))
    .limit(1)

  if (!authUserRow) return 0

  const deleted = await db
    .delete(authSession)
    .where(eq(authSession.userId, authUserRow.id))
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
