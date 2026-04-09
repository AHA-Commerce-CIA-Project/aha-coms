import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { getCurrentPeriod } from '@/lib/orbit-utils';

export async function GET() {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Active templates
  const templates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true, frequency: true },
  });

  // Current period claims for each frequency
  const dailyPeriod = getCurrentPeriod('daily');
  const weeklyPeriod = getCurrentPeriod('weekly');
  const monthlyPeriod = getCurrentPeriod('monthly');

  const currentPeriodClaims = await prisma.routineTaskClaim.findMany({
    where: {
      period: { in: [dailyPeriod, weeklyPeriod, monthlyPeriod] },
    },
    include: { template: { select: { frequency: true } } },
  });

  // Compliance: templates with claims / total templates per frequency
  const compliance = {
    daily: { total: 0, claimed: 0, completed: 0 },
    weekly: { total: 0, claimed: 0, completed: 0 },
    monthly: { total: 0, claimed: 0, completed: 0 },
  };

  for (const t of templates) {
    const freq = t.frequency as keyof typeof compliance;
    if (compliance[freq]) compliance[freq].total++;
    const claim = currentPeriodClaims.find((c) => c.template.frequency === t.frequency && c.templateId === t.id);
    if (claim) {
      compliance[freq].claimed++;
      if (claim.status === 'completed') compliance[freq].completed++;
    }
  }

  const totalTemplates = templates.length;
  const totalClaimed = currentPeriodClaims.length;
  const overallCompliance = totalTemplates > 0 ? Math.round((totalClaimed / totalTemplates) * 100) : 0;

  // Top claimers (all time)
  const claimerCounts = await prisma.routineTaskClaim.groupBy({
    by: ['claimedBy'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  const topClaimers = await Promise.all(
    claimerCounts.map(async (c) => {
      const user = await prisma.user.findUnique({
        where: { id: c.claimedBy },
        select: { name: true, image: true },
      });
      const completedCount = await prisma.routineTaskClaim.count({
        where: { claimedBy: c.claimedBy, status: 'completed' },
      });
      return {
        name: user?.name || 'Unknown',
        image: user?.image || null,
        totalClaims: c._count.id,
        completedClaims: completedCount,
        completionRate: c._count.id > 0 ? Math.round((completedCount / c._count.id) * 100) : 0,
      };
    })
  );

  // Per-template compliance for current period
  const templateCompliance = templates.map((t) => {
    const period = getCurrentPeriod(t.frequency);
    const claim = currentPeriodClaims.find((c) => c.templateId === t.id);
    return {
      id: t.id,
      name: t.name,
      frequency: t.frequency,
      status: claim ? claim.status : 'unclaimed',
    };
  });

  return NextResponse.json({
    overallCompliance,
    compliance,
    topClaimers,
    templateCompliance,
    totalTemplates,
    totalClaimed,
  });
}
