import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels/unread - Unread counts per channel + total
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Mirror the visibility rules from GET /api/channels so unread counts
  // only include channels this user can actually see.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  const myTeamId = me?.teamId ?? null;

  const channels = await prisma.channel.findMany({
    where: {
      isArchived: false,
      OR: [
        { createdBy: userId },
        { members: { some: { userId } } },
        { isPrivate: false, visibleToAllTeams: true },
        ...(myTeamId
          ? [{ isPrivate: false, allowedTeamIds: { has: myTeamId } }]
          : []),
      ],
    },
    select: {
      id: true,
      readStatuses: {
        where: { userId },
        select: { lastReadAt: true },
      },
    },
  });

  let totalUnread = 0;
  const perChannel: Record<string, number> = {};

  for (const channel of channels) {
    const lastReadAt = channel.readStatuses[0]?.lastReadAt;

    const unreadCount = await prisma.channelMessage.count({
      where: {
        channelId: channel.id,
        senderId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });

    perChannel[channel.id] = unreadCount;
    totalUnread += unreadCount;
  }

  return NextResponse.json({ unreadCount: totalUnread, perChannel });
}
