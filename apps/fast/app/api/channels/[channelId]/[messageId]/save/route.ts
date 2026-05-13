import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// POST /api/channels/[channelId]/[messageId]/save - Save message or reply
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageId } = await params;

  let replyId: string | null = null;
  let saveOnly = false;
  try {
    const body = await request.json();
    replyId = body?.replyId || null;
    saveOnly = body?.saveOnly === true;
  } catch {}

  if (replyId) {
    // Saving a specific reply
    const existing = await prisma.savedMessage.findFirst({
      where: { userId: session.user.id, messageId, replyId },
    });

    if (existing) {
      if (saveOnly) {
        return NextResponse.json({ action: 'already_saved' });
      }
      await prisma.savedMessage.delete({ where: { id: existing.id } });
      return NextResponse.json({ action: 'unsaved' });
    } else {
      await prisma.savedMessage.create({
        data: { userId: session.user.id, messageId, replyId },
      });
      return NextResponse.json({ action: 'saved' });
    }
  } else {
    // Saving a parent message
    const existing = await prisma.savedMessage.findFirst({
      where: { userId: session.user.id, messageId, replyId: null },
    });

    if (existing) {
      if (saveOnly) {
        return NextResponse.json({ action: 'already_saved' });
      }
      await prisma.savedMessage.delete({ where: { id: existing.id } });
      return NextResponse.json({ action: 'unsaved' });
    } else {
      await prisma.savedMessage.create({
        data: { userId: session.user.id, messageId },
      });
      return NextResponse.json({ action: 'saved' });
    }
  }
}
