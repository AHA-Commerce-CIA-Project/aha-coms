/**
 * Self-service sessions client (Spec 06 PR E §10).  Plain `fetch`-based wrappers
 * around `/api/me/sessions` — same posture as the OTP wrappers in `lib/auth.ts`
 * (Eden treaty's tagged-union narrowing felt awkward in PR C, so we kept fetch).
 */

export interface ActiveSession {
  id: string
  authMethod: 'workspace_oidc' | 'personal_otp' | 'admin_bypass'
  deviceLabel: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export type ListSessionsResult =
  | { kind: 'ok'; sessions: ActiveSession[] }
  | { kind: 'network_error' }

export async function listSessions(): Promise<ListSessionsResult> {
  try {
    const res = await fetch('/api/me/sessions', { credentials: 'same-origin' })
    if (!res.ok) return { kind: 'network_error' }
    const body = (await res.json()) as { sessions: ActiveSession[] }
    return { kind: 'ok', sessions: body.sessions ?? [] }
  } catch {
    return { kind: 'network_error' }
  }
}

export type RevokeSessionResult =
  | { kind: 'revoked'; clearedCookie: boolean }
  | { kind: 'not_found' }
  | { kind: 'network_error' }

export async function revokeSessionById(sessionId: string): Promise<RevokeSessionResult> {
  try {
    const res = await fetch(`/api/me/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    if (res.status === 404) return { kind: 'not_found' }
    if (!res.ok) return { kind: 'network_error' }
    const body = (await res.json()) as { ok: true; clearedCookie: boolean }
    return { kind: 'revoked', clearedCookie: !!body.clearedCookie }
  } catch {
    return { kind: 'network_error' }
  }
}

export type SignOutOthersResult = { kind: 'ok' } | { kind: 'network_error' }

export async function signOutAllOtherDevices(): Promise<SignOutOthersResult> {
  try {
    const res = await fetch('/api/me/sessions/sign-out-others', {
      method: 'POST',
      credentials: 'same-origin',
    })
    if (!res.ok) return { kind: 'network_error' }
    return { kind: 'ok' }
  } catch {
    return { kind: 'network_error' }
  }
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelativeFromNow(iso: string): string {
  const then = new Date(iso).getTime()
  const seconds = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return RTF.format(seconds, 'second')
  if (abs < 3600) return RTF.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return RTF.format(Math.round(seconds / 3600), 'hour')
  return RTF.format(Math.round(seconds / 86_400), 'day')
}

const AUTH_METHOD_LABEL: Record<ActiveSession['authMethod'], string> = {
  workspace_oidc: 'Google',
  personal_otp: 'Email code',
  admin_bypass: 'Admin link',
}

export function authMethodLabel(method: ActiveSession['authMethod']): string {
  return AUTH_METHOD_LABEL[method] ?? method
}
