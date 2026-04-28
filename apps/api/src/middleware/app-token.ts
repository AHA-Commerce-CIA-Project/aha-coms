import { Elysia } from 'elysia'
import { db } from '~/db'
import { appRegistry } from '~/db/schema/apps'
import { eq, and } from 'drizzle-orm'
import { verifyGoogleOidcToken } from '~/services/oidc-verifier'

export interface AppContext {
  id: string
  slug: string
  serviceAccountEmail: string
}

/**
 * Elysia plugin that authenticates inbound Google OIDC ID tokens from app service accounts.
 * Attaches { id, slug, serviceAccountEmail } to context as `app`.
 */
export function requireAppToken() {
  return new Elysia({ name: 'require-app-token' }).derive(
    { as: 'scoped' },
    async ({ request, status }): Promise<{ app: AppContext }> => {
      const authHeader = request.headers.get('authorization')

      if (!authHeader) {
        throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }

      const audience = process.env.SERVICE_URL ?? ''

      let email: string
      try {
        const payload = await verifyGoogleOidcToken(authHeader, audience)
        if (!payload.email) {
          throw new Error('No email claim in token')
        }
        email = payload.email
      } catch {
        throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }

      const [row] = await db
        .select({
          id: appRegistry.id,
          slug: appRegistry.slug,
          serviceAccountEmail: appRegistry.serviceAccountEmail,
        })
        .from(appRegistry)
        .where(
          and(
            eq(appRegistry.serviceAccountEmail, email),
            eq(appRegistry.status, 'active'),
          ),
        )
        .limit(1)

      if (!row || !row.serviceAccountEmail) {
        throw status(403, { error: 'forbidden', reason: 'app_not_registered', email })
      }

      return {
        app: {
          id: row.id,
          slug: row.slug,
          serviceAccountEmail: row.serviceAccountEmail,
        },
      }
    },
  )
}
