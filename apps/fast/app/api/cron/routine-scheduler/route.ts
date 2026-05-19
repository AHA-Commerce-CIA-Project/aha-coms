import { NextRequest, NextResponse } from 'next/server';
import { runScheduler } from '@/lib/routine-scheduler';

// POST — Fire the routine-reminder scheduler. Intended to be called by
// Cloud Scheduler on a `* * * * *` UTC cadence (see
// infra/fast/cloud-scheduler.tf). The scheduler is idempotent —
// templates only spawn once per period regardless of how often this
// endpoint is hit, so over-calling is safe.
//
// Headless by design: this route is invoked by GCP Cloud Scheduler
// with no user cookie / session present, so the auth boundary is a
// shared bearer token (CRON_SECRET) rather than the usual
// requireFastAuth() flow. None of the code reachable from this entry
// point reads `session` / `currentUser` — verified by audit
// 2026-05-19. The system-bot id used as the channel-message author
// is created idempotently from the server-side prisma client (see
// lib/system-bot.ts).
//
// Auth: shared secret in the `Authorization: Bearer <CRON_SECRET>`
// header. CRON_SECRET must be set in the environment — if missing we
// 503 instead of running unauthenticated, so a misconfigured deploy
// can't silently fire bot messages.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on the server.' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization') || '';
  // Constant-time compare via Buffer to avoid early-exit timing leaks on the
  // shared secret. Length mismatch is a fast fail (no information leaked
  // about the secret's content).
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let ok = 0;
  for (let i = 0; i < auth.length; i++) {
    ok |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (ok !== 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Second line of defense around runScheduler. The library function
  // catches per-template throws and a top-level catch internally; this
  // outer try/catch protects against the unlikely case that the
  // library throws synchronously before reaching its own guard (e.g.
  // a module-load error). Cloud Scheduler retries on 5xx per its
  // retry_config, so a 500 here gets a second swing automatically.
  try {
    const results = await runScheduler(new Date());
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({ ranAt: new Date().toISOString(), summary, results });
  } catch (err: any) {
    console.error('CRON ROUTINE FAILED:', err);
    return NextResponse.json(
      {
        error: 'scheduler crashed',
        detail: err?.message || 'unknown',
        ranAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
