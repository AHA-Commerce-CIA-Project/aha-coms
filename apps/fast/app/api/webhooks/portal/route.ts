import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { dispatchPortalEvent } from '@/lib/portal/dispatch'
import { verifyGoogleIdToken } from '@/lib/portal/oidc'
import { unwrapWebhookEnvelope } from '@/lib/portal/unwrap-envelope'

// /fast/api/webhooks/portal — portal-issued webhook consumer
// (Spec 05 Phase 7 / T77).
//
// Auth: Bearer Google ID-token signed by PORTAL_SERVICE_ACCOUNT_EMAIL
// with audience SELF_PUBLIC_URL. Same primitive heroes-api uses at
// apps/heroes-api/src/routes/portal-webhooks.ts — chosen over the
// SDK's HMAC signing path because OIDC binds the signer's identity
// to a GCP service account that the portal already operates, so
// rotation lives inside Secret Manager, not in a shared secret that
// has to be kept in sync between two app_webhook_endpoints rows.
//
// Idempotency: `portal_webhook_events.event_id` PK. The portal
// retries delivery at-least-once; the dedup insert short-circuits
// duplicates to 200 before the dispatch handler runs.
//
// Middleware allowlist: apps/fast/middleware.ts puts `/api/webhooks`
// on PUBLIC_PATH_PREFIXES so the inbound request never carries (or
// requires) the portal `__session` cookie — the portal SA's ID token
// is the only credential that matters here.
//
// `force-dynamic` for the same reason as /api/health: the DB
// round-trip cannot run during `next build` (no DATABASE_URL),
// and a build-time failure would block every deploy.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<Response> {
  const event = req.headers.get('X-Portal-Event')
  const eventId = req.headers.get('X-Portal-Event-Id')

  if (!event || !eventId) {
    return NextResponse.json({ message: 'missing header' }, { status: 400 })
  }

  const portalSAEmail = process.env.PORTAL_SERVICE_ACCOUNT_EMAIL
  const selfAudience = process.env.SELF_PUBLIC_URL
  if (!portalSAEmail || !selfAudience) {
    console.error('[portal-webhook] PORTAL_SERVICE_ACCOUNT_EMAIL and SELF_PUBLIC_URL must be set')
    return NextResponse.json({ message: 'webhook auth not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'missing bearer token' }, { status: 401 })
  }

  try {
    await verifyGoogleIdToken({
      idToken: authHeader.slice('Bearer '.length),
      expectedAudience: selfAudience,
      expectedSAEmail: portalSAEmail,
    })
  } catch (err) {
    console.warn(`[portal-webhook] OIDC verification failed: ${(err as Error).message}`)
    return NextResponse.json({ message: 'invalid bearer token' }, { status: 401 })
  }

  const rawBody = await req.text()

  // Dedup via PK insert. createMany + skipDuplicates returns
  // { count: 0 } on conflict, { count: 1 } on first arrival — the
  // cleanest shape Prisma exposes for ON CONFLICT DO NOTHING.
  const insert = await prisma.portalWebhookEvent.createMany({
    data: [{ eventId }],
    skipDuplicates: true,
  })

  if (insert.count === 0) {
    console.log(`[portal-webhook] duplicate event ${eventId} — skipping`)
    return NextResponse.json({ ok: true })
  }

  const unwrapped = unwrapWebhookEnvelope(rawBody)
  if (!unwrapped.ok) {
    console.warn(
      `[portal-webhook] envelope rejected reason=${unwrapped.reason} event=${event} eventId=${eventId}` +
        (unwrapped.detail ? ` detail=${unwrapped.detail}` : ''),
    )
    return NextResponse.json(
      {
        message:
          unwrapped.reason === 'malformed_json' ? 'malformed json body' : 'envelope missing payload',
      },
      { status: 400 },
    )
  }

  console.log(
    `[portal-webhook] dispatching event=${event} eventId=${eventId} appSlug=${unwrapped.appSlug ?? '<none>'}`,
  )
  await dispatchPortalEvent(event, unwrapped.payload)
  return NextResponse.json({ ok: true })
}
