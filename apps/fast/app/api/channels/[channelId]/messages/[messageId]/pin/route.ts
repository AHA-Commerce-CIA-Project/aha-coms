import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// POST /api/channels/[channelId]/messages/[messageId]/pin — toggle the
// channel-wide pin state of a single message. Any authenticated channel
// member can flip the bit; matches the permission level of save/reaction
// (the other member-level mutations on a message).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId, messageId } = await params;

  const message = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, isPinned: true },
  });

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  // Guard against ID-tampering: the message must actually belong to the
  // channel in the URL. Otherwise a caller could pin a message in a private
  // channel they have no membership in.
  if (message.channelId !== channelId) {
    return NextResponse.json({ error: 'Message does not belong to this channel' }, { status: 400 });
  }

  const updated = await prisma.channelMessage.update({
    where: { id: messageId },
    data: { isPinned: !message.isPinned },
    select: { id: true, isPinned: true },
  });

  return NextResponse.json({ id: updated.id, isPinned: updated.isPinned });
}
