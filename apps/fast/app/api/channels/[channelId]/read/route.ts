import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// PUT /api/channels/[channelId]/read - Mark channel as read
export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  await prisma.channelReadStatus.upsert({
    where: {
      channelId_userId: { channelId, userId: session.user.id },
    },
    update: { lastReadAt: new Date() },
    create: {
      channelId,
      userId: session.user.id,
      lastReadAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}
