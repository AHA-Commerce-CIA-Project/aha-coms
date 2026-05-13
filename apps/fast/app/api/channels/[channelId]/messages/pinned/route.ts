import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/channels/[channelId]/messages/pinned — list every message in
// this channel that has isPinned=true. Powers the small banner that sits
// above the message feed. Ordered newest-first so the most recent pin is
// the headline of the banner. Returns the minimum shape the banner needs:
// id, content snippet, sender name, createdAt — no replies/reactions.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const pinned = await prisma.channelMessage.findMany({
    where: { channelId, isPinned: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      sender: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ pinned });
}
