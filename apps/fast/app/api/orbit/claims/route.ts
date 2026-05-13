import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { getCurrentPeriod } from '@/lib/orbit-utils';
import { logActivity } from '@/lib/activity-log';

export async function GET(request: Request) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const frequency = searchParams.get('frequency') || 'daily';
  const period = searchParams.get('period') || getCurrentPeriod(frequency);

  const claims = await prisma.routineTaskClaim.findMany({
    where: { period },
    include: {
      template: { select: { id: true, name: true, frequency: true } },
      claimer: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json(claims);
}

export async function POST(request: Request) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await request.json();
  if (!templateId) return NextResponse.json({ error: 'templateId required' }, { status: 400 });

  const template = await prisma.routineTaskTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.isActive) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const period = getCurrentPeriod(template.frequency);

  // For team-wide tasks, check if THIS user already claimed (not just anyone)
  if (template.isTeamWide) {
    const existingClaim = await prisma.routineTaskClaim.findUnique({
      where: { templateId_period_claimedBy: { templateId, period, claimedBy: session.user.id } },
    });
    if (existingClaim) {
      return NextResponse.json({ error: 'You have already claimed this task for this period' }, { status: 409 });
    }
  }

  try {
    const claim = await prisma.routineTaskClaim.create({
      data: {
        templateId,
        claimedBy: session.user.id,
        period,
        status: 'claimed',
      },
      include: {
        template: { select: { id: true, name: true, frequency: true } },
        claimer: { select: { id: true, name: true, image: true } },
      },
    });

    // Log activity
    logActivity(session.user.id, 'orbit_claimed', `${session.user.name} claimed routine task "${template.name}" (${template.frequency})`, 'orbit', claim.id);

    // Notify leaders
    await prisma.notification.createMany({
      data: (await prisma.user.findMany({
        where: { role: { in: ['leader', 'admin'] }, id: { not: session.user.id } },
        select: { id: true },
      })).map((u) => ({
        userId: u.id,
        type: 'orbit_task_claimed',
        title: `Routine task claimed`,
        message: `${session.user.name} claimed "${template.name}" (${template.frequency})`,
        data: { templateId, claimId: claim.id },
      })),
    });

    return NextResponse.json(claim, { status: 201 });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: template.isTeamWide ? 'You have already claimed this task for this period' : 'This task has already been claimed for this period' }, { status: 409 });
    }
    throw err;
  }
}
