import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

export async function GET() {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const delegations = await prisma.routineTaskDelegation.findMany({
    where: { toUserId: session.user.id, status: 'pending' },
    include: {
      fromUser: { select: { id: true, name: true, image: true } },
      claim: {
        include: {
          template: { select: { id: true, name: true, frequency: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(delegations);
}

export async function POST(request: Request) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { claimId, toUserId } = await request.json();
  if (!claimId || !toUserId) {
    return NextResponse.json({ error: 'claimId and toUserId required' }, { status: 400 });
  }

  const claim = await prisma.routineTaskClaim.findUnique({
    where: { id: claimId },
    include: { template: { select: { name: true } } },
  });

  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  if (claim.claimedBy !== session.user.id) {
    return NextResponse.json({ error: 'You can only delegate your own claims' }, { status: 403 });
  }
  if (claim.status === 'completed') {
    return NextResponse.json({ error: 'Cannot delegate a completed task' }, { status: 400 });
  }

  // Check for existing pending delegation
  const existing = await prisma.routineTaskDelegation.findFirst({
    where: { claimId, status: 'pending' },
  });
  if (existing) {
    return NextResponse.json({ error: 'A pending delegation already exists for this task' }, { status: 409 });
  }

  const delegation = await prisma.routineTaskDelegation.create({
    data: {
      claimId,
      fromUserId: session.user.id,
      toUserId,
      status: 'pending',
    },
  });

  // Notify recipient
  await prisma.notification.create({
    data: {
      userId: toUserId,
      type: 'orbit_delegation_request',
      title: 'Delegation Request',
      message: `${session.user.name} wants to delegate "${claim.template.name}" to you`,
      data: { delegationId: delegation.id, claimId },
    },
  });

  return NextResponse.json(delegation, { status: 201 });
}
