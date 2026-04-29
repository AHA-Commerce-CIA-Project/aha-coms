import { Elysia } from 'elysia'
import { db } from '~/db'
import { appRegistry } from '~/db/schema/apps'
import { eq } from 'drizzle-orm'
import { decodeProtectedHeader, jwtVerify, importJWK } from 'jose'
import { PORTAL_BROKER_ISSUER } from '~/services/auth-broker'
import { portalBrokerSigningKeys, SIGNING_KEY_STATUS } from '~/db/schema/signing-keys'
import { inArray } from 'drizzle-orm'

const LEGACY_PORTAL_BROKER_ISSUER = 'coms-portal-broker'

export interface BrokerAppContext {
  id: string
  slug: string
}

export function requireBrokerToken() {
  return new Elysia({ name: 'require-broker-token' }).derive(
    { as: 'scoped' },
    async ({ request, status }): Promise<{ app: BrokerAppContext }> => {
      const authHeader = request.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }

      const token = authHeader.slice(7)

      let appSlugClaim: string
      try {
        const header = decodeProtectedHeader(token)
        if (!header.kid) {
          throw new Error('missing kid')
        }

        const rows = await db
          .select({ kid: portalBrokerSigningKeys.kid, publicJwk: portalBrokerSigningKeys.publicJwk })
          .from(portalBrokerSigningKeys)
          .where(
            inArray(portalBrokerSigningKeys.status, [
              SIGNING_KEY_STATUS.ACTIVE,
              SIGNING_KEY_STATUS.RETIRING,
            ]),
          )

        const match = rows.find((r) => r.kid === header.kid)
        if (!match) {
          throw new Error('unknown kid')
        }

        const publicKey = await importJWK(match.publicJwk, 'ES256')
        // We do not know appSlug yet for audience check — decode first to get it,
        // then verify audience matches.
        const { payload } = await jwtVerify<{ appSlug: string }>(token, publicKey, {
          issuer: [PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER],
          algorithms: ['ES256'],
        })

        if (!payload.appSlug) {
          throw new Error('missing appSlug claim')
        }
        appSlugClaim = payload.appSlug

        // Verify audience matches the expected audience for this appSlug.
        const expectedAudience = `portal:app:${appSlugClaim}`
        const aud = payload.aud
        const audArray = Array.isArray(aud) ? aud : [aud]
        if (!audArray.includes(expectedAudience)) {
          throw new Error('audience mismatch')
        }
      } catch {
        throw status(401, { error: 'unauthorized', reason: 'invalid_token' })
      }

      const [row] = await db
        .select({ id: appRegistry.id, slug: appRegistry.slug })
        .from(appRegistry)
        .where(eq(appRegistry.slug, appSlugClaim))
        .limit(1)

      if (!row) {
        throw status(401, { error: 'unauthorized', reason: 'invalid_token' })
      }

      return { app: { id: row.id, slug: row.slug } }
    },
  )
}
