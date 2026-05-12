import { error, redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import {
  PORTAL_SESSION_COOKIE,
  PortalSessionDeniedError,
  createLocalSessionForPortalUser,
} from '@coms-portal/heroes-shared/auth/session'
import { PortalBrokerError, exchangePortalCode } from '$lib/server/portal-broker'
import type { RequestHandler } from './$types'

function safeRedirect(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return `${base}/dashboard`
  return raw
}

export const GET: RequestHandler = async ({ url, cookies, setHeaders }) => {
  // Firebase Hosting strips Set-Cookie from any response it considers
  // cacheable when fronting Cloud Run; the only escape hatch is to mark the
  // response uncacheable so the CDN passes it through verbatim. Without this
  // the `coms_session` Set-Cookie never reaches the browser and the post-
  // exchange redirect to `/heroes/dashboard` arrives unauthed, kicking off
  // the portal↔heroes redirect loop observed at T30.
  // Ref: https://firebase.google.com/docs/hosting/manage-cache
  setHeaders({ 'cache-control': 'private, no-store' })

  const code = url.searchParams.get('portal_code')
  if (!code) error(400, 'Missing portal_code')

  let payload
  try {
    payload = await exchangePortalCode(code)
  } catch (err) {
    if (err instanceof PortalBrokerError) {
      console.error('Portal broker rejected exchange', err)
      error(err.status === 400 ? 400 : 502, err.message)
    }
    console.error('Portal broker exchange failed', err)
    error(502, 'Portal handoff failed')
  }

  try {
    const { token, expiresAt } = await createLocalSessionForPortalUser(payload.sessionUser)
    cookies.set(PORTAL_SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'lax',
      expires: expiresAt,
    })
  } catch (err) {
    if (err instanceof PortalSessionDeniedError) {
      error(403, 'Access denied. Contact your administrator.')
    }
    throw err
  }

  // redirectTo on the exchange payload is authoritative; portal_redirect_to
  // is the query-param echo. Prefer the payload, fall back to the query.
  const target = safeRedirect(payload.redirectTo ?? url.searchParams.get('portal_redirect_to'))
  redirect(303, target)
}
