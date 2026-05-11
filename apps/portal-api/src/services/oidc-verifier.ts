/**
 * OIDC ID-token verifier for Cloud Tasks → service and Pub/Sub → service callbacks,
 * and for service-to-service verification (webhook receivers, introspect endpoints).
 *
 * Cloud Tasks (and Pub/Sub push) attach a Google-issued OIDC ID token in the
 * Authorization: Bearer <jwt> header. We verify the signature against Google's
 * public keys, the audience matches our service URL, and the issuer is Google.
 * Callers additionally check the `email` claim equals the expected service
 * account email — that check lives at the call site so each route can use its
 * own expected SA without coupling.
 *
 * `verifyGoogleIdToken` is a stricter wrapper for service-to-service contexts
 * where the SA email assertion must be done atomically with signature verification.
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

// ---------------------------------------------------------------------------
// Service-to-service: strict ID-token verifier (Rev 2)
// ---------------------------------------------------------------------------

/**
 * Verify a Google-issued OIDC ID token and assert the caller's SA email.
 *
 * Unlike `verifyGoogleOidcToken` (which returns the raw payload and delegates
 * the email check to the call site), this wrapper performs the SA email
 * assertion internally. It is designed for service-to-service contexts where
 * the expected SA is known at the verifier boundary — notably webhook receivers
 * (Rev 2 §03) and the introspect endpoint (Rev 2 §04).
 *
 * @param opts.idToken          - The raw JWT string (no "Bearer " prefix).
 * @param opts.expectedAudience - Expected `aud` claim (e.g. the receiver's origin URL).
 * @param opts.expectedSAEmail  - Expected `email` claim (the portal SA email).
 * @returns Verified `{ email, sub }` on success.
 * @throws  When the token is invalid, the issuer/audience doesn't match, the
 *          email is not verified, or the SA email doesn't match.
 */
export async function verifyGoogleIdToken(opts: {
  idToken: string
  expectedAudience: string
  expectedSAEmail: string
}): Promise<{ email: string; sub: string }> {
  const ticket = await oauthClient.verifyIdToken({
    idToken: opts.idToken,
    audience: opts.expectedAudience,
  })

  const payload = ticket.getPayload()
  if (!payload) throw new Error('Token payload missing after verification')

  if (!payload.email_verified) {
    throw new Error('Token email_verified is false')
  }

  if (payload.email !== opts.expectedSAEmail) {
    throw new Error(
      `Token email mismatch: expected ${opts.expectedSAEmail}, got ${payload.email ?? '<none>'}`,
    )
  }

  return { email: payload.email, sub: payload.sub! }
}
