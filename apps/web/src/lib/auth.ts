import { api } from '$lib/api'
import type { PortalRole } from '@coms-portal/shared'

export interface SessionUser {
  id: string
  email: string
  name: string
  portalRole: PortalRole
  apps: string[]
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
