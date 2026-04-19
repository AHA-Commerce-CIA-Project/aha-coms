import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// DELETE /api/channels/[channelId] - Only the creator can delete their own channel
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdBy: true },
  });

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  if (channel.createdBy !== session.user.id) {
    return NextResponse.json(
      { error: 'Only the channel creator can delete this channel' },
      { status: 403 }
    );
  }

  await prisma.channel.delete({ where: { id: channelId } });

  return NextResponse.json({ success: true });
}
