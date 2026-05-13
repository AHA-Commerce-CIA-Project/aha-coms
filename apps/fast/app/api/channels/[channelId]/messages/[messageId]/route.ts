import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// PATCH - Edit message (only by sender)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageId } = await params;
  const { content } = await request.json();

  const message = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true },
  });

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if (message.senderId !== session.user.id) {
    return NextResponse.json({ error: 'You can only edit your own messages' }, { status: 403 });
  }

  const updated = await prisma.channelMessage.update({
    where: { id: messageId },
    data: { content: content?.trim() || '' },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      savedBy: { where: { userId: session.user.id }, select: { id: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE - Delete message (only by sender or leader/admin)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageId } = await params;

  const message = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true },
  });

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const isOwner = message.senderId === session.user.id;
  const isAdmin = session.user.role === 'leader' || session.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
  }

  await prisma.channelMessage.delete({ where: { id: messageId } });

  return NextResponse.json({ success: true });
}
