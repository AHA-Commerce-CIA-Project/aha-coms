import { GoogleAuth } from 'google-auth-library'

const PROJECT_ID = process.env.GIP_PROJECT_ID!
const GIP_BASE = 'https://identitytoolkit.googleapis.com/v1'

const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

async function getAccessToken(): Promise<string> {
  const client = await googleAuth.getClient()
  const res = await client.getAccessToken()
  if (!res.token) throw new Error('Failed to obtain GCP access token')
  return res.token
}

export interface DecodedToken {
  uid: string
  email?: string
  name?: string
  [key: string]: unknown
}

/** Verify a Firebase ID token via the Identity Toolkit REST API. */
export async function verifyIdToken(idToken: string): Promise<DecodedToken> {
  const accessToken = await getAccessToken()
  const res = await fetch(`${GIP_BASE}/accounts:lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ idToken }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`verifyIdToken failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as {
    users?: { localId: string; email?: string; displayName?: string }[]
  }
  const user = data.users?.[0]
  if (!user) throw new Error('Token valid but no user record found')

  return { uid: user.localId, email: user.email, name: user.displayName }
}


/** Revoke all refresh tokens for a user. */
export async function revokeRefreshTokens(uid: string): Promise<void> {
  const accessToken = await getAccessToken()

  const res = await fetch(
    `${GIP_BASE}/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        localId: uid,
        validSince: Math.floor(Date.now() / 1000).toString(),
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`revokeRefreshTokens failed (${res.status}): ${body}`)
  }
}

/** Send a password reset email via the Identity Toolkit REST API. */
export async function generatePasswordResetLink(email: string): Promise<string> {
  const accessToken = await getAccessToken()

  const res = await fetch(`${GIP_BASE}/accounts:sendOobCode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      requestType: 'PASSWORD_RESET',
      email,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`generatePasswordResetLink failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { oobLink: string }
  return data.oobLink
}

/** Create a new GIP user via REST API. */
export async function createGipUser(email: string, password: string): Promise<string> {
  const accessToken = await getAccessToken()
  const res = await fetch(`${GIP_BASE}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`createGipUser failed (${res.status}): ${body}`)
  }
  const data = (await res.json()) as { localId: string }
  return data.localId
}

/** Update the email address of a GIP user. */
export async function updateGipUserEmail(uid: string, newEmail: string): Promise<void> {
  const accessToken = await getAccessToken()
  const res = await fetch(
    `${GIP_BASE}/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ localId: uid, email: newEmail }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`updateGipUserEmail failed (${res.status}): ${body}`)
  }
}

/**
 * GIP-side password sign-in error codes worth distinguishing from the
 * generic-bad-credentials path.
 *
 * INVALID_CREDENTIALS — bad password / unknown email / generic mismatch.
 * USER_DISABLED       — GIP-side `disableUser=true` (the portal's own
 *                       `identity_users.status` is a separate gate).
 * INVALID_EMAIL       — malformed email passed through to GIP.
 */
export type GipPasswordSignInError =
  | { code: 'INVALID_CREDENTIALS' }
  | { code: 'USER_DISABLED' }
  | { code: 'INVALID_EMAIL' }
  | { code: 'UNKNOWN'; raw: string }

export class GipSignInError extends Error {
  constructor(public detail: GipPasswordSignInError) {
    super(detail.code)
    this.name = 'GipSignInError'
  }
}

/**
 * Sign in with email + password against GIP REST `accounts:signInWithPassword`.
 * Returns the GIP-side localId on success. Throws `GipSignInError` with a
 * structured detail on the documented failure modes.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ localId: string }> {
  const accessToken = await getAccessToken()
  const res = await fetch(`${GIP_BASE}/accounts:signInWithPassword`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  })
  if (res.ok) {
    const data = (await res.json()) as { localId: string }
    return { localId: data.localId }
  }
  const raw = await res.text()
  // GIP returns { error: { message: "INVALID_LOGIN_CREDENTIALS" | "USER_DISABLED" | ... } }
  let code: GipPasswordSignInError['code'] = 'UNKNOWN'
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } }
    const msg = parsed.error?.message ?? ''
    if (
      msg === 'INVALID_LOGIN_CREDENTIALS' ||
      msg === 'EMAIL_NOT_FOUND' ||
      msg === 'INVALID_PASSWORD'
    ) {
      code = 'INVALID_CREDENTIALS'
    } else if (msg === 'USER_DISABLED') {
      code = 'USER_DISABLED'
    } else if (msg === 'INVALID_EMAIL') {
      code = 'INVALID_EMAIL'
    }
  } catch {
    // Non-JSON body — fall through to UNKNOWN
  }
  if (code === 'UNKNOWN') {
    throw new GipSignInError({ code: 'UNKNOWN', raw })
  }
  throw new GipSignInError({ code })
}

/**
 * Update a GIP user's password via the Identity Toolkit REST API.
 * Used by POST /api/auth/password/set for both the first-set and change-
 * password modes.
 */
export async function updateGipUserPassword(
  uid: string,
  newPassword: string,
): Promise<void> {
  const accessToken = await getAccessToken()
  const res = await fetch(
    `${GIP_BASE}/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ localId: uid, password: newPassword }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`updateGipUserPassword failed (${res.status}): ${body}`)
  }
}

/** Disable or enable a GIP user account. */
export async function setGipUserDisabled(uid: string, disabled: boolean): Promise<void> {
  const accessToken = await getAccessToken()
  const res = await fetch(
    `${GIP_BASE}/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        localId: uid,
        disableUser: disabled,
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`setGipUserDisabled failed (${res.status}): ${body}`)
  }
}
