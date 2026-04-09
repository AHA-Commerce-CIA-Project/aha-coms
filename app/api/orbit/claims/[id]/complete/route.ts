import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-log';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const claim = await prisma.routineTaskClaim.findUnique({
    where: { id },
    include: { template: { select: { name: true } } },
  });

  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  if (claim.claimedBy !== session.user.id) {
    return NextResponse.json({ error: 'You can only complete your own claims' }, { status: 403 });
  }

  let completionNote: string | null = null;
  try {
    const body = await request.json();
    completionNote = body?.note?.trim() || null;
  } catch {}

  const updated = await prisma.routineTaskClaim.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date(), completionNote },
    include: {
      template: { select: { id: true, name: true, frequency: true } },
      claimer: { select: { id: true, name: true, image: true } },
    },
  });

  // Log activity
  logActivity(session.user.id, 'orbit_completed', `${session.user.name} completed routine task "${claim.template.name}"`, 'orbit', id);

  // Notify leaders
  await prisma.notification.createMany({
    data: (await prisma.user.findMany({
      where: { role: { in: ['leader', 'admin'] }, id: { not: session.user.id } },
      select: { id: true },
    })).map((u) => ({
      userId: u.id,
      type: 'orbit_task_completed',
      title: `Routine task completed`,
      message: `${session.user.name} completed "${claim.template.name}"`,
      data: { claimId: id },
    })),
  });

  return NextResponse.json(updated);
}
