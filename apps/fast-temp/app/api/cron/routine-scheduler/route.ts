import { NextRequest, NextResponse } from 'next/server';
import { runScheduler } from '@/lib/routine-scheduler';

// POST — Fire the routine-reminder scheduler. Intended to be called by Cloud
// Scheduler (or any cron) on a short cadence (every 1–5 minutes). The
// scheduler is idempotent: templates only spawn once per period regardless
// of how often this endpoint is hit, so over-calling is safe.
//
// Auth: shared secret in the `Authorization: Bearer <CRON_SECRET>` header.
// CRON_SECRET must be set in the environment — if missing we 503 instead of
// running unauthenticated, so a misconfigured deploy can't silently fire
// bot messages.
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

  const results = await runScheduler(new Date());
  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ranAt: new Date().toISOString(), summary, results });
}
