import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { action } = await request.json();

  if (!['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const delegation = await prisma.routineTaskDelegation.findUnique({
    where: { id },
    include: {
      claim: { include: { template: { select: { name: true } } } },
      fromUser: { select: { name: true } },
    },
  });

  if (!delegation) return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });
  if (delegation.toUserId !== session.user.id) {
    return NextResponse.json({ error: 'Only the recipient can respond' }, { status: 403 });
  }
  if (delegation.status !== 'pending') {
    return NextResponse.json({ error: 'Delegation already resolved' }, { status: 400 });
  }

  if (action === 'accept') {
    await prisma.$transaction([
      prisma.routineTaskDelegation.update({
        where: { id },
        data: { status: 'accepted' },
      }),
      prisma.routineTaskClaim.update({
        where: { id: delegation.claimId },
        data: { claimedBy: session.user.id },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: delegation.fromUserId,
        type: 'orbit_delegation_accepted',
        title: 'Delegation Accepted',
        message: `${session.user.name} accepted your delegation of "${delegation.claim.template.name}"`,
        data: { delegationId: id },
      },
    });
  } else {
    await prisma.routineTaskDelegation.update({
      where: { id },
      data: { status: 'declined' },
    });

    await prisma.notification.create({
      data: {
        userId: delegation.fromUserId,
        type: 'orbit_delegation_declined',
        title: 'Delegation Declined',
        message: `${session.user.name} declined your delegation of "${delegation.claim.template.name}"`,
        data: { delegationId: id },
      },
    });
  }

  return NextResponse.json({ success: true, action });
}
