import { error, redirect } from '@sveltejs/kit'
import {
  PORTAL_SESSION_COOKIE,
  PortalSessionDeniedError,
  createLocalSessionForPortalUser,
} from '@coms/shared/auth/session'
import { PortalBrokerError, exchangePortalCode } from '$lib/server/portal-broker'
import type { RequestHandler } from './$types'

function safeRedirect(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

export const GET: RequestHandler = async ({ url, cookies }) => {
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
