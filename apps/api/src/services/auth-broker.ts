import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify, decodeProtectedHeader, importJWK } from 'jose'
import { eq, inArray } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema/apps'
import { authHandoffs } from '~/db/schema/auth-handoffs'
import {
  portalBrokerSigningKeys,
  SIGNING_KEY_STATUS,
} from '~/db/schema/signing-keys'
import { loadActiveSigningKey } from './signing-keys'
import { PORTAL_ORIGIN } from '~/config'
import { logger } from '~/logger'
import type { AppRegistry } from '~/db/schema/apps'
import type {
  PortalBrokerExchangePayload,
  PortalBrokerHandoffResponse,
  PortalSessionUser,
} from '@coms-portal/shared'

/**
 * Issuer values for broker tokens (Rev 2 §02 dual-mode).
 *
 * **Mint side — split by alg, dual-mode safety (red-cell C2):**
 *   - HS256 tokens are minted with the LEGACY bare-string issuer
 *     (`coms-portal-broker`) so today's Heroes — which verifies HS256 with
 *     `issuer: 'coms-portal-broker'` (single string, no array) — keeps
 *     working. Switching the mint-side issuer to URL-form before Heroes
 *     ships H1 would break every login.
 *   - ES256 tokens are minted with the NEW URL-form issuer
 *     (`${PORTAL_ORIGIN}/broker`). This matches the OIDC discovery
 *     document and is what stock OIDC client libraries expect.
 *
 * **Verifier side — accept both:** every `jwtVerify` call uses an array
 * `[PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` so tokens minted on
 * either issuer (including pre-Rev-2 tokens still in flight) keep verifying.
 *
 * **Discovery document — advertise URL-form only:** the JWKS-fronted
 * canonical issuer for OIDC clients is the URL-form. The legacy bare-string
 * is purely a tokens-in-flight transition artefact.
 *
 * Day-30 cleanup (see spec-01 §"Migration Plan"): drop HS256 minting,
 * delete `signHS256BrokerToken` + `LEGACY_PORTAL_BROKER_ISSUER`, and
 * collapse the verifier `issuer` array to a single string.
 */

/** URL-form issuer — used by ES256 minting + discovery document. */
export const PORTAL_BROKER_ISSUER = `${PORTAL_ORIGIN}/broker`

/** Bare-string issuer — used by HS256 minting during dual-mode for Heroes compat. */
const LEGACY_PORTAL_BROKER_ISSUER = 'coms-portal-broker'

const BROKER_CODE_TTL_SECONDS = 300
const BROKER_TOKEN_TTL_SECONDS = 300

/**
 * Validate redirect_to against the target app's registered URL.
 *
 * Only accepted:
 *  - Relative paths that start with exactly one '/' (not '//').
 *  - Absolute URLs whose hostname EXACTLY matches the hostname of the app's
 *    registered URL in app_registry. Port is intentionally ignored: Cloud Run
 *    assigns the same host regardless of port, and app_registry.url typically
 *    omits the port, so comparing hostname alone is both correct and safe.
 *
 * Returns the normalized string to store, or `undefined` to drop the value.
 * Logs a console.warn when a non-empty input is rejected so the decision is
 * traceable.
 */
export function sanitizeRedirectTo(
  redirectTo: string | undefined | null,
  appUrl: string,
): string | undefined {
  // Empty / absent — nothing to validate.
  if (!redirectTo) return undefined

  // Protocol-relative URLs are rejected outright (they inherit the current
  // scheme and can route off-domain).
  if (redirectTo.startsWith('//')) {
    logger.warn({ redirectTo }, '[auth-broker] rejected protocol-relative redirect_to')
    return undefined
  }

  // Relative paths (starting with exactly one '/') are safe: the app that
  // receives portal_redirect_to can only redirect within its own origin.
  if (redirectTo.startsWith('/')) return redirectTo

  // Absolute URL — parse and validate.
  let parsed: URL
  try {
    parsed = new URL(redirectTo)
  } catch {
    logger.warn({ redirectTo }, '[auth-broker] rejected malformed redirect_to')
    return undefined
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    logger.warn({ redirectTo }, '[auth-broker] rejected non-http redirect_to')
    return undefined
  }

  // Compare hostname only (port is ignored — see JSDoc rationale above).
  let registeredHostname: string
  try {
    registeredHostname = new URL(appUrl).hostname
  } catch {
    logger.warn({ appUrl }, '[auth-broker] invalid appUrl in registry, rejecting redirect_to')
    return undefined
  }

  if (parsed.hostname !== registeredHostname) {
    logger.warn({ redirectTo, expectedHost: registeredHostname }, '[auth-broker] rejected redirect_to with mismatched host')
    return undefined
  }

  return parsed.toString()
}

export class BrokerAuthorizationError extends Error {}
export class BrokerValidationError extends Error {}

export function brokerAudienceFor(appSlug: string): string {
  return `portal:app:${appSlug}`
}

type BrokerCapableApp = Pick<
  AppRegistry,
  'slug' | 'url' | 'transportMode' | 'handoffMode' | 'brokerOrigin' | 'status' | 'brokerSigningSecret'
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

function getBrokerSecretForApp(app: BrokerCapableApp): Uint8Array {
  const secret = app.brokerSigningSecret ?? process.env.PORTAL_BROKER_SIGNING_SECRET
  if (!secret) {
    throw new BrokerValidationError(
      `No broker signing secret configured for app "${app.slug}". ` +
      'Set broker_signing_secret in app_registry or PORTAL_BROKER_SIGNING_SECRET as fallback.'
    )
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

/**
 * Sign a broker token with the legacy HS256 path (per-app symmetric secret).
 *
 * Preserved verbatim during dual-mode (Rev 2 §01 migration). Will be
 * removed once Heroes ships ES256-only verification (Day 30 — see spec-01
 * §"Migration Plan"). The function shape and the per-app `app` argument
 * are unchanged so existing callers continue to compile.
 *
 * Issuer: LEGACY bare-string `'coms-portal-broker'` — Heroes today verifies
 * HS256 with this exact value (single string, not an array). Until Heroes
 * ships H1 dual-issuer-accept, keeping HS256 on the legacy issuer is what
 * makes portal deploy independent of Heroes deploy (red-cell finding C2).
 */
async function signHS256BrokerToken(
  payload: BrokerTokenPayload,
  app: BrokerCapableApp,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(LEGACY_PORTAL_BROKER_ISSUER)
    .setAudience(brokerAudienceFor(payload.appSlug))
    .setIssuedAt(now)
    .setExpirationTime(now + BROKER_TOKEN_TTL_SECONDS)
    .sign(getBrokerSecretForApp(app))
}

/**
 * Sign a broker token with ES256 using the global active signing key
 * (Rev 2 §01). The `kid` header lets verifiers fetch the matching public
 * JWK from `/.well-known/jwks.json`. No per-app secret needed.
 */
async function signES256BrokerToken(payload: BrokerTokenPayload): Promise<string> {
  const { kid, privateKey } = await loadActiveSigningKey()
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
    .setIssuer(PORTAL_BROKER_ISSUER)
    .setAudience(brokerAudienceFor(payload.appSlug))
    .setIssuedAt(now)
    .setExpirationTime(now + BROKER_TOKEN_TTL_SECONDS)
    .sign(privateKey)
}

/**
 * Mint both an HS256 (legacy) and an ES256 (new) broker token for the
 * same payload. During the dual-mode transition the launch redirect
 * carries both as siblings so Heroes can verify whichever it knows how
 * to. After Heroes ships ES256 verification we drop HS256.
 *
 * If ES256 minting fails (e.g. no active key bootstrapped, Secret Manager
 * outage), we log and degrade gracefully to HS256-only — better than
 * blocking every login on a key-rotation issue. The legacy path is the
 * safety net during dual-mode by definition.
 */
async function signBrokerToken(
  payload: BrokerTokenPayload,
  app: BrokerCapableApp,
): Promise<{ hs256: string; es256: string | null }> {
  const hs256 = await signHS256BrokerToken(payload, app)
  let es256: string | null = null
  try {
    es256 = await signES256BrokerToken(payload)
  } catch (err) {
    logger.warn({ err }, '[auth-broker] ES256 minting failed, falling back to HS256-only for this token')
  }
  return { hs256, es256 }
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
        brokerSigningSecret: true,
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

  // Sanitize once at entry; the cleaned value flows into all three handoff paths.
  redirectTo = sanitizeRedirectTo(redirectTo, app.url)

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
    const { hs256, es256 } = await signBrokerToken({
      appSlug: app.slug,
      userId: authUser.id,
      gipUid: authUser.gipUid,
      email: authUser.email,
      name: authUser.name,
      portalRole: authUser.portalRole,
      teamIds: authUser.teamIds,
      apps: authUser.apps,
      redirectTo,
    }, app)

    // Dual-mode (Rev 2 §01 + §02): emit both tokens on both surfaces.
    //
    // Response payload fields (v1.2 contract):
    //   tokenHs256 — the HS256 sibling (new canonical field)
    //   tokenEs256 — the ES256 sibling (preferred; null if key not bootstrapped)
    //   token      — deprecated alias for tokenHs256; kept until Heroes drops HS256
    //
    // Redirect URL query params (unchanged surface, Heroes v1 reads portal_token):
    //   portal_token      — HS256 (legacy Heroes reads this)
    //   portal_token_es256 — ES256 (Heroes v2+ reads this)
    return {
      appSlug: app.slug,
      handoffMode: 'token_exchange',
      tokenHs256: hs256,
      tokenEs256: es256,
      token: hs256,
      expiresAt: expiresAt.toISOString(),
      redirectUrl: buildRedirectUrl(app.url, {
        portal_token: hs256,
        portal_token_es256: es256 ?? undefined,
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

  const app = await db.query.appRegistry.findFirst({
    where: eq(appRegistry.slug, input.appSlug),
    columns: { slug: true, url: true, transportMode: true, handoffMode: true, brokerOrigin: true, status: true, brokerSigningSecret: true },
  })
  if (!app) throw new BrokerValidationError('App not found')

  // Discriminate verification by the JWT's `alg` header (Rev 2 §01
  // dual-mode). HS256 → legacy per-app symmetric secret. ES256 → fetch
  // the matching public JWK by `kid` from `portal_broker_signing_keys`
  // (active + retiring rows). Anything else → reject.
  let header
  try {
    header = decodeProtectedHeader(input.token!)
  } catch {
    throw new BrokerValidationError('Malformed broker token header')
  }

  let payload: BrokerTokenPayload & { exp?: number }
  if (header.alg === 'ES256') {
    payload = await verifyES256BrokerToken(input.token!, input.appSlug)
  } else if (header.alg === 'HS256') {
    const secret = getBrokerSecretForApp(app)
    const verified = await jwtVerify<BrokerTokenPayload>(input.token!, secret, {
      issuer: [PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER],
      audience: brokerAudienceFor(input.appSlug),
    })
    payload = verified.payload
  } else {
    throw new BrokerValidationError(`Unsupported token alg: ${header.alg ?? 'unknown'}`)
  }

  if (payload.appSlug !== input.appSlug) {
    throw new BrokerValidationError('Token audience does not match requested app')
  }

  return payloadToExchangeResponse(
    payload,
    new Date((payload.exp ?? Math.floor(Date.now() / 1000)) * 1000),
  )
}

/**
 * Verify an ES256 broker token by looking up its `kid` in the local
 * signing-keys table. Only `active` and `retiring` keys are accepted
 * (the same set the JWKS endpoint will publish in T2) — `retired` keys
 * have aged past the max token TTL and any token signed with one is
 * already expired by definition.
 */
async function verifyES256BrokerToken(
  token: string,
  appSlug: string,
): Promise<BrokerTokenPayload & { exp?: number }> {
  const header = decodeProtectedHeader(token)
  if (!header.kid) {
    throw new BrokerValidationError('ES256 broker token missing kid header')
  }

  const rows = await db
    .select({
      kid: portalBrokerSigningKeys.kid,
      publicJwk: portalBrokerSigningKeys.publicJwk,
    })
    .from(portalBrokerSigningKeys)
    .where(
      inArray(portalBrokerSigningKeys.status, [
        SIGNING_KEY_STATUS.ACTIVE,
        SIGNING_KEY_STATUS.RETIRING,
      ]),
    )

  const match = rows.find((r) => r.kid === header.kid)
  if (!match) {
    throw new BrokerValidationError(`Unknown signing kid: ${header.kid}`)
  }

  const publicKey = await importJWK(match.publicJwk, 'ES256')
  const { payload } = await jwtVerify<BrokerTokenPayload>(token, publicKey, {
    // Accept both the URL-form issuer (Rev 2+) and the legacy bare-string issuer
    // (pre-Rev-2 tokens) during the dual-mode transition window. Drop
    // LEGACY_PORTAL_BROKER_ISSUER from this array after Day-30 cleanup.
    issuer: [PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER],
    audience: brokerAudienceFor(appSlug),
    algorithms: ['ES256'],
  })
  return payload
}
