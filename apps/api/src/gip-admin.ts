import { GoogleAuth } from 'google-auth-library'
import { jwtVerify, importX509, decodeProtectedHeader } from 'jose'

const PROJECT_ID = process.env.GIP_PROJECT_ID!
const GIP_BASE = 'https://identitytoolkit.googleapis.com/v1'
const SESSION_KEYS_URL =
  'https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys'

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

/** Create a session cookie via the Identity Toolkit REST API. */
export async function createSessionCookie(
  idToken: string,
  expiresInMs: number,
): Promise<string> {
  const accessToken = await getAccessToken()
  const validDuration = Math.floor(expiresInMs / 1000)

  const res = await fetch(
    `${GIP_BASE}/projects/${PROJECT_ID}:createSessionCookie`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ idToken, validDuration }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`createSessionCookie failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { sessionCookie: string }
  return data.sessionCookie
}

// --- Session cookie JWT verification ---

let cachedKeys: Map<string, CryptoKey> = new Map()
let cacheExpiry = 0

async function getSessionKeys(): Promise<Map<string, CryptoKey>> {
  if (Date.now() < cacheExpiry && cachedKeys.size > 0) return cachedKeys

  const res = await fetch(SESSION_KEYS_URL)
  if (!res.ok) throw new Error(`Failed to fetch session keys: ${res.status}`)

  const cc = res.headers.get('cache-control') ?? ''
  const m = cc.match(/max-age=(\d+)/)
  cacheExpiry = Date.now() + (m ? parseInt(m[1]) * 1000 : 3600_000)

  const certs = (await res.json()) as Record<string, string>
  cachedKeys = new Map()

  for (const [kid, pem] of Object.entries(certs)) {
    cachedKeys.set(kid, await importX509(pem, 'RS256'))
  }

  return cachedKeys
}

/** Verify a Firebase session cookie JWT locally. */
export async function verifySessionCookie(
  sessionCookie: string,
): Promise<DecodedToken> {
  const header = decodeProtectedHeader(sessionCookie)
  if (!header.kid) throw new Error('Session cookie missing kid header')

  let keys = await getSessionKeys()
  let key = keys.get(header.kid)

  if (!key) {
    // Key may have rotated — force refresh
    cacheExpiry = 0
    keys = await getSessionKeys()
    key = keys.get(header.kid)
    if (!key) throw new Error(`Unknown signing key: ${header.kid}`)
  }

  const { payload } = await jwtVerify(sessionCookie, key, {
    issuer: `https://session.firebase.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  })

  return {
    ...payload,
    uid: payload.sub!,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
  }
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

/** Set custom claims on a GIP user. */
export async function setCustomUserClaims(
  uid: string,
  claims: object,
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
      body: JSON.stringify({
        localId: uid,
        customAttributes: JSON.stringify(claims),
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`setCustomUserClaims failed (${res.status}): ${body}`)
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
