import { OAuth2Client } from 'google-auth-library'

// Module-level singleton — verifyIdToken caches Google's signing certs internally,
// so reusing the same client across calls avoids refetching on every request.
const oauth2Client = new OAuth2Client()

export type VerifyGoogleIdTokenOptions = {
  idToken: string
  expectedAudience: string
  expectedSAEmail: string
}

/**
 * Verify a Google-issued ID token and assert it was minted by the expected
 * service account for the expected audience.
 *
 * Throws on signature/expiry/issuer failure (delegated to google-auth-library)
 * or when the payload does not match the expected SA email / verified state.
 * The caller decides whether/how to log; this layer never swallows errors.
 */
export async function verifyGoogleIdToken(opts: VerifyGoogleIdTokenOptions): Promise<void> {
  const { idToken, expectedAudience, expectedSAEmail } = opts

  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: expectedAudience,
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('id token verification returned no payload')
  }

  if (payload.email_verified !== true) {
    throw new Error('id token payload email_verified is not true')
  }

  if (payload.email !== expectedSAEmail) {
    throw new Error(
      `id token email "${payload.email ?? '<missing>'}" does not match expected SA "${expectedSAEmail}"`,
    )
  }
}
