import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels/[channelId]/search?q=query
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  // Search messages in the channel
  const messages = await prisma.channelMessage.findMany({
    where: {
      channelId,
      content: { contains: query, mode: 'insensitive' },
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true, name: true, image: true } },
    },
  });

  // Also search thread replies in this channel
  const replies = await prisma.threadReply.findMany({
    where: {
      message: { channelId },
      content: { contains: query, mode: 'insensitive' },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      message: { select: { id: true, content: true } },
    },
  });

  return NextResponse.json({ messages, replies });
}
