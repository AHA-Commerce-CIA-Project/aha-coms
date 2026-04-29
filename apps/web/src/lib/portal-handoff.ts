import { logger } from '~/lib/logger'

export interface HandoffIntent {
  appSlug: string
  redirectTo?: string
}

const STORAGE_KEY = 'portal:handoff-intent'

/**
 * Returns true for redirect_to values that are safe to forward to the broker.
 *
 * Rejects obviously dangerous values (protocol-relative URLs, non-http
 * schemes). The authoritative host check is performed server-side by the
 * broker via sanitizeRedirectTo in auth-broker.ts, which validates the
 * hostname against the app's registered URL in app_registry.
 *
 * Accepts:
 *   - Relative paths starting with / but NOT // (no protocol-relative URLs)
 *   - Absolute http: or https: URLs on any hostname
 */
export function isSafeRedirectTo(value: string): boolean {
  if (!value) return false

  if (value.startsWith('//')) return false

  if (value.startsWith('/')) return true

  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Parse `?app=<slug>&redirect_to=<url>` from a URL. Returns null if `app` is missing. */
export function readHandoffIntent(url: URL): HandoffIntent | null {
  const appSlug = url.searchParams.get('app')
  if (!appSlug) return null

  const raw = url.searchParams.get('redirect_to')
  let redirectTo: string | undefined

  if (raw !== null) {
    if (isSafeRedirectTo(raw)) {
      redirectTo = raw
    } else {
      logger.warn({ raw }, '[portal-handoff] rejected unsafe redirect_to')
    }
  }

  return { appSlug, redirectTo }
}

/** Navigate to the broker launch endpoint via POST form submission (CSRF-safe). */
export function navigateToLaunch(intent: HandoffIntent): void {
  const form = document.createElement('form')
  form.method = 'POST'
  let action = `/api/auth/broker/launch/${intent.appSlug}`
  if (intent.redirectTo) {
    action += `?redirectTo=${encodeURIComponent(intent.redirectTo)}`
  }
  form.action = action
  document.body.appendChild(form)
  form.submit()
}

/** Persist an intent into sessionStorage so it survives a login bounce. */
export function stashIntent(intent: HandoffIntent): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent))
}

/** Pop the stashed intent (read + clear). Returns null if none stashed. */
export function popStashedIntent(): HandoffIntent | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  window.sessionStorage.removeItem(STORAGE_KEY)
  try {
    return JSON.parse(raw) as HandoffIntent
  } catch {
    return null
  }
}
