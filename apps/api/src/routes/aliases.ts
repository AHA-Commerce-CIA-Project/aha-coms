import { Elysia, t } from 'elysia'
import { requireAppToken } from '../middleware/app-token'
import { resolveAliases } from '../services/aliases'

// ---------------------------------------------------------------------------
// Per-app token bucket rate limiter — in-memory, single-instance.
// In-memory only — multi-instance Cloud Run deploys will allow up to N×20 RPS
// until upgraded to Redis-backed limiter.
// ---------------------------------------------------------------------------

const buckets = new Map<string, { tokens: number; lastRefill: number }>()
const REFILL_RATE_PER_SECOND = 20
const BURST_CAPACITY = 40

function takeToken(appId: string): boolean {
  const now = Date.now()
  let bucket = buckets.get(appId)
  if (!bucket) {
    bucket = { tokens: BURST_CAPACITY, lastRefill: now }
    buckets.set(appId, bucket)
  }
  const elapsed = (now - bucket.lastRefill) / 1000
  bucket.tokens = Math.min(BURST_CAPACITY, bucket.tokens + elapsed * REFILL_RATE_PER_SECOND)
  bucket.lastRefill = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

const MAX_BODY_BYTES = 256 * 1024 // 256 KB

export const aliasesRoutes = new Elysia({ prefix: '/aliases' })
  .use(requireAppToken())
  .post(
    '/resolve-batch',
    async ({ app, body, request, status }) => {
      const contentLength = request.headers.get('content-length')
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
        throw status(413, { error: 'payload_too_large' })
      }

      if (!takeToken(app.id)) {
        return new Response(
          JSON.stringify({ error: 'rate_limited', retry_after_seconds: 1 }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '1',
            },
          },
        )
      }

      const resolved = await resolveAliases(body.names)
      const results = resolved.map((r) => ({
        input: r.name,
        match: r.match
          ? {
              portalSub: r.match.identityUserId,
              aliasId: r.match.aliasNormalized,
              isPrimary: r.match.isPrimary,
              tombstoned: r.match.tombstoned,
              deactivatedAt: r.match.deactivatedAt,
            }
          : null,
      }))

      return { results }
    },
    {
      body: t.Object({
        names: t.Array(t.String(), { maxItems: 1000 }),
      }),
      response: {
        200: t.Object({
          results: t.Array(
            t.Object({
              input: t.String(),
              match: t.Union([
                t.Null(),
                t.Object({
                  portalSub: t.String(),
                  aliasId: t.String(),
                  isPrimary: t.Boolean(),
                  tombstoned: t.Boolean(),
                  deactivatedAt: t.Union([t.Date(), t.Null()]),
                }),
              ]),
            }),
          ),
        }),
        413: t.Object({ error: t.Literal('payload_too_large') }),
        429: t.Object({ error: t.Literal('rate_limited'), retry_after_seconds: t.Number() }),
      },
    },
  )
