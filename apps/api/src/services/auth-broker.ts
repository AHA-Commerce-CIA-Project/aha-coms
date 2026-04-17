import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema/apps'
import { authHandoffs } from '~/db/schema/auth-handoffs'
import type { AppRegistry } from '~/db/schema/apps'
import type {
  PortalBrokerExchangePayload,
  PortalBrokerHandoffResponse,
  PortalSessionUser,
} from '@coms-portal/shared'

const PORTAL_BROKER_ISSUER = 'coms-portal-broker'
const PORTAL_BROKER_AUDIENCE = 'coms-service-app'
const BROKER_CODE_TTL_SECONDS = 120
const BROKER_TOKEN_TTL_SECONDS = 120

export class BrokerAuthorizationError extends Error {}
export class BrokerValidationError extends Error {}

type BrokerCapableApp = Pick<
  AppRegistry,
  'slug' | 'url' | 'transportMode' | 'handoffMode' | 'brokerOrigin' | 'status'
>

type BrokerTokenPayload = {
  appSlug: string
  userId: string
  gipUid: string
  email: string
  name: string
  portalRole: PortalSessionUser['portalRole']
  teamIds: string[]
  apps: string[]
  redirectTo?: string | null
}

function getBrokerSecret(): Uint8Array {
  const secret = process.env.PORTAL_BROKER_SIGNING_SECRET
  if (!secret) {
    throw new BrokerValidationError('PORTAL_BROKER_SIGNING_SECRET is required for token_exchange')
  }
  return new TextEncoder().encode(secret)
}

function hashCode(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createRawCode(): string {
  return randomBytes(24).toString('base64url')
}

function buildRedirectUrl(
  baseUrl: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

function assertAppAccess(app: BrokerCapableApp, authUser: PortalSessionUser): void {
  if (app.status !== 'active') {
    throw new BrokerAuthorizationError('App is not active')
  }
  if (!authUser.apps.includes(app.slug)) {
    throw new BrokerAuthorizationError('User does not have access to this app')
  }
}

async function signBrokerToken(payload: BrokerTokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(PORTAL_BROKER_ISSUER)
    .setAudience(PORTAL_BROKER_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + BROKER_TOKEN_TTL_SECONDS)
    .sign(getBrokerSecret())
}

function payloadToExchangeResponse(
  payload: BrokerTokenPayload,
  expiresAt: Date,
): PortalBrokerExchangePayload {
  return {
    appSlug: payload.appSlug,
    brokeredAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    redirectTo: payload.redirectTo ?? null,
    sessionUser: {
      id: payload.userId,
      gipUid: payload.gipUid,
      email: payload.email,
      name: payload.name,
      portalRole: payload.portalRole,
      teamIds: payload.teamIds,
      apps: payload.apps,
    },
  }
}

export async function findBrokerAppBySlug(appSlug: string): Promise<BrokerCapableApp | null> {
  return (
    (await db.query.appRegistry.findFirst({
      where: eq(appRegistry.slug, appSlug),
      columns: {
        slug: true,
        url: true,
        transportMode: true,
        handoffMode: true,
        brokerOrigin: true,
        status: true,
      },
    })) ?? null
  )
}

export async function createBrokerHandoff(
  app: BrokerCapableApp,
  authUser: PortalSessionUser,
  redirectTo?: string,
): Promise<PortalBrokerHandoffResponse> {
  assertAppAccess(app, authUser)

  if (app.transportMode === 'same_host_cookie' || app.handoffMode === 'none') {
    return {
      appSlug: app.slug,
      handoffMode: 'none',
      redirectUrl: buildRedirectUrl(app.url, {
        portal_redirect_to: redirectTo,
      }),
    }
  }

  if (app.handoffMode === 'token_exchange') {
    const expiresAt = new Date(Date.now() + BROKER_TOKEN_TTL_SECONDS * 1000)
    const token = await signBrokerToken({
      appSlug: app.slug,
      userId: authUser.id,
      gipUid: authUser.gipUid,
      email: authUser.email,
      name: authUser.name,
      portalRole: authUser.portalRole,
      teamIds: authUser.teamIds,
      apps: authUser.apps,
      redirectTo,
    })

    return {
      appSlug: app.slug,
      handoffMode: 'token_exchange',
      token,
      expiresAt: expiresAt.toISOString(),
      redirectUrl: buildRedirectUrl(app.url, {
        portal_token: token,
        portal_app: app.slug,
        portal_redirect_to: redirectTo,
      }),
    }
  }

  const code = createRawCode()
  const expiresAt = new Date(Date.now() + BROKER_CODE_TTL_SECONDS * 1000)

  await db.insert(authHandoffs).values({
    codeHash: hashCode(code),
    appSlug: app.slug,
    userId: authUser.id,
    gipUid: authUser.gipUid,
    email: authUser.email,
    name: authUser.name,
    portalRole: authUser.portalRole,
    teamIds: authUser.teamIds,
    apps: authUser.apps,
    redirectTo: redirectTo ?? null,
    expiresAt,
  })

  return {
    appSlug: app.slug,
    handoffMode: 'one_time_code',
    code,
    expiresAt: expiresAt.toISOString(),
    redirectUrl: buildRedirectUrl(app.url, {
      portal_code: code,
      portal_app: app.slug,
      portal_redirect_to: redirectTo,
    }),
  }
}

export async function exchangeBrokerHandoff(input: {
  appSlug: string
  code?: string
  token?: string
}): Promise<PortalBrokerExchangePayload> {
  if (!!input.code === !!input.token) {
    throw new BrokerValidationError('Provide exactly one of code or token')
  }

  if (input.code) {
    const handoff = await db.query.authHandoffs.findFirst({
      where: eq(authHandoffs.codeHash, hashCode(input.code)),
    })

    if (!handoff || handoff.appSlug !== input.appSlug || handoff.consumedAt || handoff.expiresAt <= new Date()) {
      throw new BrokerValidationError('Invalid or expired handoff code')
    }

    await db
      .update(authHandoffs)
      .set({ consumedAt: new Date() })
      .where(eq(authHandoffs.id, handoff.id))

    return {
      appSlug: handoff.appSlug,
      brokeredAt: new Date().toISOString(),
      expiresAt: handoff.expiresAt.toISOString(),
      redirectTo: handoff.redirectTo ?? null,
      sessionUser: {
        id: handoff.userId,
        gipUid: handoff.gipUid,
        email: handoff.email,
        name: handoff.name,
        portalRole: handoff.portalRole as PortalSessionUser['portalRole'],
        teamIds: handoff.teamIds ?? [],
        apps: handoff.apps ?? [],
      },
    }
  }

  const secret = getBrokerSecret()
  const { payload } = await jwtVerify<BrokerTokenPayload>(input.token!, secret, {
    issuer: PORTAL_BROKER_ISSUER,
    audience: PORTAL_BROKER_AUDIENCE,
  })

  if (payload.appSlug !== input.appSlug) {
    throw new BrokerValidationError('Token audience does not match requested app')
  }

  return payloadToExchangeResponse(
    payload,
    new Date((payload.exp ?? Math.floor(Date.now() / 1000)) * 1000),
  )
}
