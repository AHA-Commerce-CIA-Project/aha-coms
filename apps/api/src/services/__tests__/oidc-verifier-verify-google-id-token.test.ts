/**
 * Tests for verifyGoogleIdToken — the strict service-to-service OIDC wrapper
 * added in Rev 2 §03. These tests confirm:
 *
 * 1. Valid token with email_verified=true and matching SA email → resolves { email, sub }.
 * 2. Token with email_verified=false → throws.
 * 3. Token with wrong SA email → throws, error message includes both expected and actual.
 *
 * The existing verifyGoogleOidcToken (Rev 1 §05) is NOT tested here — its tests
 * live separately and this file must not alter its behaviour.
 */

import { describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Mock google-auth-library before module import
// ---------------------------------------------------------------------------

// We swap out verifyIdToken on OAuth2Client to control what the token yields.
// The mock is set up module-scope here; individual tests override it via
// mock.mockImplementation inside the test body.

let verifyIdTokenImpl: () => Promise<{ getPayload: () => Record<string, unknown> | null }>

const mockVerifyIdToken = mock((..._args: unknown[]) => verifyIdTokenImpl())

mock.module('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = mockVerifyIdToken
  },
  GoogleAuth: class {},
}))

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { verifyGoogleIdToken } = await import('../oidc-verifier')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(
  payload: Record<string, unknown> | null,
): { getPayload: () => Record<string, unknown> | null } {
  return { getPayload: () => payload }
}

const PORTAL_SA = 'portal-sa@coms-portal-prod.iam.gserviceaccount.com'
const FAKE_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.fake.token'
const FAKE_AUDIENCE = 'https://heroes.ahacommerce.net'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyGoogleIdToken', () => {
  test('resolves { email, sub } for a valid token with email_verified=true and matching SA email', async () => {
    verifyIdTokenImpl = async () =>
      makeTicket({
        email: PORTAL_SA,
        email_verified: true,
        sub: 'sa-numeric-id-1234',
        iss: 'https://accounts.google.com',
        aud: FAKE_AUDIENCE,
      })

    const result = await verifyGoogleIdToken({
      idToken: FAKE_TOKEN,
      expectedAudience: FAKE_AUDIENCE,
      expectedSAEmail: PORTAL_SA,
    })

    expect(result.email).toBe(PORTAL_SA)
    expect(result.sub).toBe('sa-numeric-id-1234')
  })

  test('throws when email_verified is false', async () => {
    verifyIdTokenImpl = async () =>
      makeTicket({
        email: PORTAL_SA,
        email_verified: false,
        sub: 'sa-numeric-id-1234',
        iss: 'https://accounts.google.com',
        aud: FAKE_AUDIENCE,
      })

    await expect(
      verifyGoogleIdToken({
        idToken: FAKE_TOKEN,
        expectedAudience: FAKE_AUDIENCE,
        expectedSAEmail: PORTAL_SA,
      }),
    ).rejects.toThrow('email_verified is false')
  })

  test('throws with both expected and actual email when SA email does not match', async () => {
    const actualEmail = 'rogue-sa@attacker-project.iam.gserviceaccount.com'

    verifyIdTokenImpl = async () =>
      makeTicket({
        email: actualEmail,
        email_verified: true,
        sub: 'rogue-numeric-id',
        iss: 'https://accounts.google.com',
        aud: FAKE_AUDIENCE,
      })

    const rejection = verifyGoogleIdToken({
      idToken: FAKE_TOKEN,
      expectedAudience: FAKE_AUDIENCE,
      expectedSAEmail: PORTAL_SA,
    })

    await expect(rejection).rejects.toThrow(PORTAL_SA)
    await expect(rejection).rejects.toThrow(actualEmail)
  })

  test('throws when the token payload is null (verifyIdToken bug / implementation mismatch)', async () => {
    verifyIdTokenImpl = async () => makeTicket(null)

    await expect(
      verifyGoogleIdToken({
        idToken: FAKE_TOKEN,
        expectedAudience: FAKE_AUDIENCE,
        expectedSAEmail: PORTAL_SA,
      }),
    ).rejects.toThrow('payload missing')
  })

  test('propagates errors thrown by verifyIdToken (bad signature, wrong audience, etc.)', async () => {
    verifyIdTokenImpl = async () => {
      throw new Error('Token used too late, 1234567890 > 1234567800: ')
    }

    await expect(
      verifyGoogleIdToken({
        idToken: FAKE_TOKEN,
        expectedAudience: FAKE_AUDIENCE,
        expectedSAEmail: PORTAL_SA,
      }),
    ).rejects.toThrow('Token used too late')
  })
})
