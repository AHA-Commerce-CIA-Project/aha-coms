// Spec 08 PR A1 stub.
// The pre-A1 implementation looked up sessions by joining authSession ↔ authUser ↔ users.email.
// PR A1 dropped authUser, the users table, and userEmails; the broker exchange (rewritten in
// PR A2) becomes the single insertion point for heroes_profiles + authSession.
// These stubs keep tsc green so PR A1 can ship the schema migration; PR A2 reimplements the
// session lifecycle directly against heroes_profiles.id (= portal_sub).

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

export type LocalSessionRecord = {
  sessionId: string
  userId: string
  expiresAt: Date
  email: string
  portalRole: string
  apps: string[]
}

function notImplemented(fn: string): never {
  throw new Error(
    `[spec-08-pr-a1] ${fn} requires the PR A2 broker-exchange rewrite (heroes_profiles upsert from portal handoff).`,
  )
}

export async function createLocalSessionForPortalUser(
  _portalUser: PortalSessionUser,
): Promise<{ token: string; expiresAt: Date }> {
  return notImplemented('createLocalSessionForPortalUser')
}

export async function destroyLocalSessionByToken(_token: string): Promise<void> {
  return notImplemented('destroyLocalSessionByToken')
}

export async function getLocalSessionByToken(_token: string): Promise<LocalSessionRecord | null> {
  return notImplemented('getLocalSessionByToken')
}

export async function destroySessionsForUserEmail(_email: string): Promise<number> {
  return notImplemented('destroySessionsForUserEmail')
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
