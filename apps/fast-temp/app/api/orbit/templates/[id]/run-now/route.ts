import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { spawnTaskIfDue } from '@/lib/routine-scheduler';

// POST — Leader-only manual trigger. Forces the template to spawn a Task +
// channel card immediately, skipping the period dedup check. Intended for
// QA / first-run validation, not normal operation.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const result = await spawnTaskIfDue(id, new Date(), true);
  return NextResponse.json(result);
}
