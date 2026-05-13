import { env } from '$env/dynamic/private'

/**
 * Construct the URL the browser is redirected to when an unauth visitor lands
 * on a heroes route. Portal owns the sign-in landing page and the `app` +
 * `redirect_to` query params encode the return trip.
 *
 * Phase 2 (Spec 02) retired the broker-token exchange flow this module used
 * to host (`exchangePortalCode`, `assertExchangePayload`, et al.). Heroes
 * reads portal's `__session` cookie directly via `/api/userinfo`, so the
 * legacy round-trip is gone — only the sign-in redirect builder remains.
 *
 * FU-10 changed portal's mount point from `/` to `/portal/`. The path here
 * targets `/portal` directly so the browser does not redirect-chain through
 * Firebase Hosting's `/` → `/portal` 301 before reaching portal-web.
 */
export function buildPortalSignInUrl(redirectTo?: string): string {
  const origin = env.PORTAL_ORIGIN
  if (!origin) {
    throw new Error('PORTAL_ORIGIN must be set')
  }
  if (redirectTo) {
    return `${origin}/portal?app=heroes&redirect_to=${encodeURIComponent(redirectTo)}`
  }
  return `${origin}/portal`
}
