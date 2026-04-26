/**
 * OIDC ID-token verifier for Cloud Tasks → service and Pub/Sub → service callbacks.
 *
 * Cloud Tasks (and Pub/Sub push) attach a Google-issued OIDC ID token in the
 * Authorization: Bearer <jwt> header. We verify the signature against Google's
 * public keys, the audience matches our service URL, and the issuer is Google.
 * Callers additionally check the `email` claim equals the expected service
 * account email — that check lives at the call site so each route can use its
 * own expected SA without coupling.
 */
import { OAuth2Client } from 'google-auth-library'

const GOOGLE_OIDC_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
])

const oauthClient = new OAuth2Client()

export interface OidcPayload {
  email?: string
  email_verified?: boolean
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  [key: string]: unknown
}

/**
 * Verify a Google-issued OIDC ID token from an Authorization header.
 *
 * @param authHeader - The full Authorization header value, e.g. "Bearer <jwt>".
 *                     `null` or wrong scheme → throws.
 * @param audience   - Expected `aud` claim. For Cloud Tasks this is the target
 *                     service URL (e.g. https://coms-portal-app-xyz.run.app).
 * @returns The verified token payload.
 * @throws  When the header is missing/malformed, the signature is invalid, or
 *          the audience/issuer does not match.
 */
export async function verifyGoogleOidcToken(
  authHeader: string | null,
  audience: string,
): Promise<OidcPayload> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header')
  }
  const idToken = authHeader.slice('Bearer '.length).trim()
  if (!idToken) throw new Error('Empty bearer token')

  const ticket = await oauthClient.verifyIdToken({ idToken, audience })
  const payload = ticket.getPayload() as OidcPayload | undefined
  if (!payload) throw new Error('Token payload missing after verification')

  if (!payload.iss || !GOOGLE_OIDC_ISSUERS.has(payload.iss)) {
    throw new Error(`Unexpected issuer: ${payload.iss ?? '<none>'}`)
  }

  return payload
}
