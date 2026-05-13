import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { getCurrentPeriod } from '@/lib/orbit-utils';

export async function GET(request: NextRequest) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  // Build date filter for claims if provided
  const dateFilter: any = {};
  if (fromParam) dateFilter.gte = new Date(fromParam);
  if (toParam) {
    const toDate = new Date(toParam);
    toDate.setHours(23, 59, 59, 999);
    dateFilter.lte = toDate;
  }
  const hasDateFilter = !!fromParam || !!toParam;

  // Active templates
  const templates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true, frequency: true },
  });

  // Get claims either filtered by date or by current period
  let filteredClaims;
  if (hasDateFilter) {
    filteredClaims = await prisma.routineTaskClaim.findMany({
      where: { createdAt: dateFilter },
      include: { template: { select: { frequency: true } } },
    });
  } else {
    const dailyPeriod = getCurrentPeriod('daily');
    const weeklyPeriod = getCurrentPeriod('weekly');
    const monthlyPeriod = getCurrentPeriod('monthly');
    filteredClaims = await prisma.routineTaskClaim.findMany({
      where: { period: { in: [dailyPeriod, weeklyPeriod, monthlyPeriod] } },
      include: { template: { select: { frequency: true } } },
    });
  }

  // Compliance per frequency
  const compliance = {
    daily: { total: 0, claimed: 0, completed: 0 },
    weekly: { total: 0, claimed: 0, completed: 0 },
    monthly: { total: 0, claimed: 0, completed: 0 },
  };

  for (const t of templates) {
    const freq = t.frequency as keyof typeof compliance;
    if (compliance[freq]) compliance[freq].total++;
    const claim = filteredClaims.find((c) => c.template.frequency === t.frequency && c.templateId === t.id);
    if (claim) {
      compliance[freq].claimed++;
      if (claim.status === 'completed') compliance[freq].completed++;
    }
  }

  const totalTemplates = templates.length;
  const totalClaimed = filteredClaims.length;
  const overallCompliance = totalTemplates > 0 ? Math.round((totalClaimed / totalTemplates) * 100) : 0;

  // Top claimers (filtered by date if provided, else all time)
  const claimerWhere: any = hasDateFilter ? { createdAt: dateFilter } : {};
  const claimerCounts = await prisma.routineTaskClaim.groupBy({
    by: ['claimedBy'],
    where: claimerWhere,
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
        where: { claimedBy: c.claimedBy, status: 'completed', ...(hasDateFilter ? { createdAt: dateFilter } : {}) },
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

  // Per-template compliance
  const templateCompliance = templates.map((t) => {
    const claim = filteredClaims.find((c) => c.templateId === t.id);
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
