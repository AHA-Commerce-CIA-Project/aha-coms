import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { mirrorReplyEdit, mirrorReplyDelete } from '@/lib/syncCommentReply';

// PATCH - Edit reply (only by sender)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string; replyId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { replyId } = await params;
  const { content } = await request.json();

  const reply = await prisma.threadReply.findUnique({
    where: { id: replyId },
    select: { senderId: true },
  });

  if (!reply) {
    return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
  }

  if (reply.senderId !== session.user.id) {
    return NextResponse.json({ error: 'You can only edit your own replies' }, { status: 403 });
  }

  const updated = await prisma.threadReply.update({
    where: { id: replyId },
    data: { content: content?.trim() || '' },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  // Mirror to TaskComment if this reply belongs to a Direct Assign card.
  await mirrorReplyEdit({ replyId, content: updated.content });

  return NextResponse.json(updated);
}

// DELETE - Delete reply (only by sender or leader/admin)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string; replyId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageId, replyId } = await params;

  const reply = await prisma.threadReply.findUnique({
    where: { id: replyId },
    select: { senderId: true },
  });

  if (!reply) {
    return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
  }

  const isOwner = reply.senderId === session.user.id;
  const isAdmin = session.user.role === 'leader' || session.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'You can only delete your own replies' }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.threadReply.delete({ where: { id: replyId } }),
    prisma.channelMessage.update({
      where: { id: messageId },
      data: { replyCount: { decrement: 1 } },
    }),
  ]);

  // Cascade delete to the mirrored TaskComment if any.
  await mirrorReplyDelete({ replyId });

  return NextResponse.json({ success: true });
}
