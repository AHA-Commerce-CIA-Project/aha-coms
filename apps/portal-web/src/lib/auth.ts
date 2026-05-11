import { api } from '$lib/api'
import type { PortalRole } from '@coms-portal/shared'

export interface SessionUserCapabilities {
  canIssueOneTimeLoginLinks: boolean
}

export interface SessionUser {
  id: string
  email: string
  name: string
  portalRole: PortalRole
  apps: string[]
  capabilities?: SessionUserCapabilities
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const { data, error } = await api.api.auth.me.get()
    if (error) return null
    return data as SessionUser
  } catch {
    return null
  }
}

export type OtpRequestResult =
  | { kind: 'sent'; message: string }
  | { kind: 'wrong_login_path'; message: string }
  | { kind: 'rate_limited'; message: string; retryAfter: number | null }
  | { kind: 'network_error' }

export type OtpVerifyResult =
  | { kind: 'verified' }
  | { kind: 'invalid_or_expired'; attemptsRemaining: number | null }
  | { kind: 'inactive_user'; message: string }
  | { kind: 'network_error' }

const GENERIC_RATE_LIMITED_MSG = 'Too many requests. Please try again later.'

export async function requestOtp(email: string): Promise<OtpRequestResult> {
  try {
    const res = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
    }
    if (res.status === 429) {
      const retryHeader = res.headers.get('retry-after')
      const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : null
      return {
        kind: 'rate_limited',
        message: body.message ?? GENERIC_RATE_LIMITED_MSG,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
      }
    }
    if (!res.ok) return { kind: 'network_error' }
    if (body.error === 'WRONG_LOGIN_PATH') {
      return { kind: 'wrong_login_path', message: body.message ?? '' }
    }
    return { kind: 'sent', message: body.message ?? '' }
  } catch (e) {
    console.error('[auth] requestOtp failed', e)
    return { kind: 'network_error' }
  }
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<OtpVerifyResult> {
  try {
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), code }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      ok?: true
      error?: string
      message?: string
      attemptsRemaining?: number
    }
    if (res.ok && body.ok === true) return { kind: 'verified' }
    if (body.error === 'INACTIVE_USER') {
      return { kind: 'inactive_user', message: body.message ?? '' }
    }
    if (body.error === 'INVALID_OR_EXPIRED') {
      return {
        kind: 'invalid_or_expired',
        attemptsRemaining:
          typeof body.attemptsRemaining === 'number'
            ? body.attemptsRemaining
            : null,
      }
    }
    return { kind: 'network_error' }
  } catch (e) {
    console.error('[auth] verifyOtp failed', e)
    return { kind: 'network_error' }
  }
}

// ----------------------------------------------------------------------------
// Self-service /api/me/emails wrappers (Spec 06 PR D §483-505)
// ----------------------------------------------------------------------------

export interface UserinfoEmailEntry {
  emailId: string
  address: string
  kind: 'workspace' | 'personal'
  isPrimary: boolean
  verified: boolean
  addedBy?: string
}

export interface UserinfoResponse {
  sub: string
  name: string
  email: string
  emails: UserinfoEmailEntry[]
  portalRole: PortalRole
  apps?: unknown[]
}

export async function fetchUserinfo(): Promise<UserinfoResponse | null> {
  try {
    const res = await fetch('/api/userinfo')
    if (!res.ok) return null
    return (await res.json()) as UserinfoResponse
  } catch {
    return null
  }
}

export type AddPersonalEmailResult =
  | { kind: 'added'; emailId: string; message: string }
  | { kind: 'email_in_use'; message: string }
  | { kind: 'network_error' }

export async function addPersonalEmail(email: string): Promise<AddPersonalEmailResult> {
  try {
    const res = await fetch('/api/me/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      emailId?: string
      message?: string
      error?: string
    }
    if (res.status === 409 && body.error === 'EMAIL_IN_USE') {
      return { kind: 'email_in_use', message: body.message ?? '' }
    }
    if (res.status === 202 && body.emailId) {
      return { kind: 'added', emailId: body.emailId, message: body.message ?? '' }
    }
    return { kind: 'network_error' }
  } catch (e) {
    console.error('[auth] addPersonalEmail failed', e)
    return { kind: 'network_error' }
  }
}

export type VerifyOwnedEmailResult =
  | { kind: 'verified' }
  | { kind: 'invalid_or_expired'; attemptsRemaining: number | null }
  | { kind: 'email_not_found' }
  | { kind: 'network_error' }

export async function verifyOwnedEmail(
  emailId: string,
  code: string,
): Promise<VerifyOwnedEmailResult> {
  try {
    const res = await fetch(`/api/me/emails/${encodeURIComponent(emailId)}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      ok?: true
      error?: string
      attemptsRemaining?: number
    }
    if (res.ok && body.ok === true) return { kind: 'verified' }
    if (body.error === 'EMAIL_NOT_FOUND') return { kind: 'email_not_found' }
    if (body.error === 'INVALID_OR_EXPIRED') {
      return {
        kind: 'invalid_or_expired',
        attemptsRemaining:
          typeof body.attemptsRemaining === 'number' ? body.attemptsRemaining : null,
      }
    }
    return { kind: 'network_error' }
  } catch (e) {
    console.error('[auth] verifyOwnedEmail failed', e)
    return { kind: 'network_error' }
  }
}

export type ResendOwnedEmailOtpResult =
  | { kind: 'sent'; message: string }
  | { kind: 'rate_limited'; message: string; retryAfter: number | null }
  | { kind: 'email_not_found' }
  | { kind: 'network_error' }

export async function resendOwnedEmailOtp(emailId: string): Promise<ResendOwnedEmailOtpResult> {
  try {
    const res = await fetch(`/api/me/emails/${encodeURIComponent(emailId)}/resend`, {
      method: 'POST',
    })
    const body = (await res.json().catch(() => ({}))) as {
      ok?: true
      error?: string
      message?: string
    }
    if (res.status === 429) {
      const retryHeader = res.headers.get('retry-after')
      const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : null
      return {
        kind: 'rate_limited',
        message: body.message ?? GENERIC_RATE_LIMITED_MSG,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
      }
    }
    if (res.ok && body.ok === true) return { kind: 'sent', message: body.message ?? '' }
    if (body.error === 'EMAIL_NOT_FOUND') return { kind: 'email_not_found' }
    return { kind: 'network_error' }
  } catch (e) {
    console.error('[auth] resendOwnedEmailOtp failed', e)
    return { kind: 'network_error' }
  }
}

export type SetEmailPrimaryResult =
  | { kind: 'set' }
  | { kind: 'not_verified'; message: string }
  | { kind: 'email_not_found' }
  | { kind: 'network_error' }

export async function setEmailPrimary(emailId: string): Promise<SetEmailPrimaryResult> {
  try {
    const res = await fetch(`/api/me/emails/${encodeURIComponent(emailId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isPrimary: true }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      ok?: true
      error?: string
      message?: string
    }
    if (res.ok && body.ok === true) return { kind: 'set' }
    if (body.error === 'NOT_VERIFIED') {
      return { kind: 'not_verified', message: body.message ?? '' }
    }
    if (body.error === 'EMAIL_NOT_FOUND') return { kind: 'email_not_found' }
    return { kind: 'network_error' }
  } catch (e) {
    console.error('[auth] setEmailPrimary failed', e)
    return { kind: 'network_error' }
  }
}

export type RemoveOwnedEmailResult =
  | { kind: 'removed' }
  | { kind: 'last_verified_email'; message: string }
  | { kind: 'workspace_kind_forbidden'; message: string }
  | { kind: 'email_not_found' }
  | { kind: 'network_error' }

export async function removeOwnedEmail(emailId: string): Promise<RemoveOwnedEmailResult> {
  try {
    const res = await fetch(`/api/me/emails/${encodeURIComponent(emailId)}`, {
      method: 'DELETE',
    })
    const body = (await res.json().catch(() => ({}))) as {
      ok?: true
      error?: string
      message?: string
    }
    if (res.ok && body.ok === true) return { kind: 'removed' }
    if (body.error === 'LAST_VERIFIED_EMAIL') {
      return { kind: 'last_verified_email', message: body.message ?? '' }
    }
    if (body.error === 'WORKSPACE_KIND_FORBIDDEN') {
      return { kind: 'workspace_kind_forbidden', message: body.message ?? '' }
    }
    if (body.error === 'EMAIL_NOT_FOUND') return { kind: 'email_not_found' }
    return { kind: 'network_error' }
  } catch (e) {
    console.error('[auth] removeOwnedEmail failed', e)
    return { kind: 'network_error' }
  }
}
