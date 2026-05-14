import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// /fast/api/health — readiness probe.
//
// Three consumers, one shape:
//   1. Cloud Run startup + liveness probes (infra/fast/cloud-run.tf).
//      The probe machinery hits localhost:3000 directly; the path must
//      include the basePath prefix (/fast/api/health) because Next.js
//      with basePath: '/fast' only matches routes at the prefixed URL.
//   2. Portal's dashboard health probe — 60-second polling against
//      app_registry.healthCheckUrl, populated by T76's register-fast run.
//   3. Operator curl during incident triage.
//
// Returns 200 + JSON when prisma round-trips a trivial query; 503 + JSON
// when it doesn't. The webhookSubscriptionActive field T79's task
// description named is deferred until T77 lands fast's webhook consumer
// + the portal_webhook_events dedup table; until then the field is
// omitted rather than reported as `false`, so a future consumer can
// trust its absence as "not yet implemented" rather than "actively
// broken".
//
// `force-dynamic` keeps Next.js from trying to prerender this route at
// build time — the DB roundtrip can't run during `next build` (no
// DATABASE_URL set, no Cloud SQL proxy attached) and a build-time
// failure here would block every deploy.
export const dynamic = 'force-dynamic';

type HealthResponse = {
  status: 'ok' | 'degraded';
  dbReachable: boolean;
  timestamp: string;
};

export async function GET() {
  let dbReachable = false;

  try {
    // Cheapest possible Postgres round-trip — no table scan, no lock.
    // If this throws the connection is dead or the credentials are wrong;
    // either way the container is not ready to serve real traffic.
    await prisma.$queryRaw`SELECT 1`;
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  const body: HealthResponse = {
    status: dbReachable ? 'ok' : 'degraded',
    dbReachable,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: dbReachable ? 200 : 503,
    headers: {
      // Probes must not be cached anywhere. Firebase Hosting otherwise
      // applies its default CDN cache rules to JSON responses and a
      // stale "ok" body could mask a real outage.
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
