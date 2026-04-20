export interface HandoffIntent {
  appSlug: string
  redirectTo?: string
}

const STORAGE_KEY = 'portal:handoff-intent'

/**
 * Returns true for redirect_to values that are safe to forward to the broker.
 * Accepts:
 *   - Absolute HTTPS URLs whose hostname ends with .ahacommerce.net (or is exactly ahacommerce.net)
 *   - Relative paths starting with / but NOT // (no protocol-relative URLs)
 */
export function isSafeRedirectTo(value: string): boolean {
  if (value.startsWith('//')) return false

  if (value.startsWith('/')) return true

  try {
    const u = new URL(value)
    if (u.protocol !== 'https:') return false
    const host = u.hostname
    return host === 'ahacommerce.net' || host.endsWith('.ahacommerce.net')
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
      console.warn('[portal-handoff] rejected unsafe redirect_to', raw)
    }
  }

  return { appSlug, redirectTo }
}

/** Build the broker launch URL for an intent. */
export function buildLaunchUrl(intent: HandoffIntent): string {
  let url = `/api/auth/broker/launch/${intent.appSlug}`
  if (intent.redirectTo) {
    url += `?redirectTo=${encodeURIComponent(intent.redirectTo)}`
  }
  return url
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
