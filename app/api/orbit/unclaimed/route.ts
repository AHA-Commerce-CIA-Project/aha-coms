import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { getCurrentPeriod } from '@/lib/orbit-utils';

// GET /api/orbit/unclaimed - Count unclaimed routine tasks
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const templates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true, frequency: { in: ['weekly', 'monthly'] } },
    select: { id: true, frequency: true },
  });

  const weeklyPeriod = getCurrentPeriod('weekly');
  const monthlyPeriod = getCurrentPeriod('monthly');

  const claims = await prisma.routineTaskClaim.findMany({
    where: {
      period: { in: [weeklyPeriod, monthlyPeriod] },
    },
    select: { templateId: true },
  });

  const claimedIds = new Set(claims.map((c) => c.templateId));
  const unclaimed = templates.filter((t) => !claimedIds.has(t.id)).length;

  return NextResponse.json({ unclaimedCount: unclaimed });
}
