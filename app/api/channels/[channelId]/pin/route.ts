import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// POST /api/channels/[channelId]/pin — toggle the *user-specific* pin for
// this channel. Each row in pinned_channels represents one (user, channel)
// pair, so a pin is created on first call and deleted on the second. This
// is distinct from the channel-wide message pin in
// /messages/[messageId]/pin — that flag lives on the message itself and
// is visible to every member of the channel.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;
  const userId = session.user.id;

  const existing = await prisma.pinnedChannel.findUnique({
    where: { userId_channelId: { userId, channelId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.pinnedChannel.delete({ where: { id: existing.id } });
    return NextResponse.json({ isPinned: false });
  }

  // The schema enforces uniqueness on (user_id, channel_id), but a race
  // between two clicks could still hit the constraint. Treat a duplicate
  // create as an idempotent success — the goal state ("pinned") is reached
  // either way.
  try {
    await prisma.pinnedChannel.create({ data: { userId, channelId } });
  } catch (err: unknown) {
    // P2002 = Prisma unique-constraint violation. Anything else bubbles.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code !== 'P2002') {
      throw err;
    }
  }
  return NextResponse.json({ isPinned: true });
}
