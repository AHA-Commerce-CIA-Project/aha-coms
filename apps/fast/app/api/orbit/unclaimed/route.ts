import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { getCurrentPeriod } from '@/lib/orbit-utils';

// GET /api/orbit/unclaimed - Count unclaimed routine tasks
export async function GET() {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get current user's team for filtering
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true, role: true },
  });

  const where: any = { isActive: true, frequency: { in: ['weekly', 'monthly'] } };
  if (user?.role !== 'admin') {
    where.OR = [
      { teamId: null },
      ...(user?.teamId ? [{ teamId: user.teamId }] : []),
    ];
  }

  const templates = await prisma.routineTaskTemplate.findMany({
    where,
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
