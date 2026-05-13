import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { mirrorReactionFromReply } from '@/lib/syncCommentReply';

// POST /api/channels/[channelId]/[messageId]/reactions - Toggle reaction
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageId } = await params;
  const { emoji, replyId } = await request.json();

  if (!emoji) {
    return NextResponse.json({ error: 'Emoji is required' }, { status: 400 });
  }

  // Check if reaction already exists
  const existing = await prisma.messageReaction.findFirst({
    where: {
      userId: session.user.id,
      emoji,
      ...(replyId ? { replyId } : { messageId }),
    },
  });

  if (existing) {
    // Remove reaction
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    if (replyId) {
      await mirrorReactionFromReply({ userId: session.user.id, emoji, replyId, action: 'removed' });
    }
    return NextResponse.json({ action: 'removed' });
  } else {
    // Add reaction
    const reaction = await prisma.messageReaction.create({
      data: {
        userId: session.user.id,
        emoji,
        ...(replyId ? { replyId } : { messageId }),
      },
      include: { user: { select: { id: true, name: true } } },
    });
    if (replyId) {
      await mirrorReactionFromReply({ userId: session.user.id, emoji, replyId, action: 'added' });
    }
    return NextResponse.json({ action: 'added', reaction });
  }
}
