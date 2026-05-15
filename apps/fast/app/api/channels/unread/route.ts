import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { mergeChannelUnreadCounts, type GroupedCount } from '@/lib/channel-unread';

// GET /api/channels/unread - Unread counts per channel + total
//
// The previous implementation ran one `prisma.channelMessage.count`
// per visible channel — an N+1 that landed on Cloud SQL ~16 times per
// minute per user, multiplied by however many channels the user could
// see. This route now runs at most two grouped counts regardless of N.
export async function GET() {
  const userId = (await requireFastAuth())?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Mirror the visibility rules from GET /api/channels.
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
      purpose: true,
      readStatuses: {
        where: { userId },
        select: { lastReadAt: true },
      },
    },
  });

  if (channels.length === 0) {
    return NextResponse.json({
      unreadCount: 0,
      perChannel: {},
      perPurpose: { discussion: 0, assign_task: 0 },
    });
  }

  // Split visible channels by whether the user has a read cursor.
  // Channels without a cursor: every non-self message counts as unread.
  // Channels with a cursor: only messages newer than the cursor count.
  const channelsNoCursor = channels.filter((c) => c.readStatuses.length === 0);
  const channelsWithCursor = channels
    .filter((c) => c.readStatuses.length > 0)
    .map((c) => ({ id: c.id, lastReadAt: c.readStatuses[0]!.lastReadAt }));

  const [groupedNoCursor, groupedWithCursor] = await Promise.all([
    channelsNoCursor.length === 0
      ? Promise.resolve([] as GroupedCount[])
      : prisma.channelMessage.groupBy({
          by: ['channelId'],
          where: {
            channelId: { in: channelsNoCursor.map((c) => c.id) },
            senderId: { not: userId },
          },
          _count: { _all: true },
        }),
    channelsWithCursor.length === 0
      ? Promise.resolve([] as GroupedCount[])
      : prisma.channelMessage.groupBy({
          by: ['channelId'],
          where: {
            senderId: { not: userId },
            OR: channelsWithCursor.map((c) => ({
              channelId: c.id,
              createdAt: { gt: c.lastReadAt },
            })),
          },
          _count: { _all: true },
        }),
  ]);

  const result = mergeChannelUnreadCounts(
    channels.map((c) => ({ id: c.id, purpose: c.purpose })),
    [...groupedNoCursor, ...groupedWithCursor],
  );

  return NextResponse.json(result);
}
