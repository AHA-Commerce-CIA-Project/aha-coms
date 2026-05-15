import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { buildMemberCountMap } from '@/lib/channel-member-count';

// GET /api/channels - List channels visible to current user
// Optional ?purpose=discussion|assign_task to scope results.
export async function GET(request: Request) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const purposeFilter = searchParams.get('purpose');

  // Fetch the user's team so we can filter by allowedTeamIds
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  const myTeamId = me?.teamId ?? null;

  // Access rules (any condition grants visibility):
  //  - creator of the channel
  //  - explicit member (ChannelMember row)
  //  - public channel marked visibleToAllTeams
  //  - user's team is in the channel's allowedTeamIds list
  // Private channels require creator or explicit membership.
  const channels = await prisma.channel.findMany({
    where: {
      isArchived: false,
      ...(purposeFilter ? { purpose: purposeFilter } : {}),
      OR: [
        { createdBy: userId },
        { members: { some: { userId } } },
        { isPrivate: false, visibleToAllTeams: true },
        ...(myTeamId
          ? [{ isPrivate: false, allowedTeamIds: { has: myTeamId } }]
          : []),
      ],
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { messages: true, members: true } },
      // Include the current user's PinnedChannel row (0 or 1) so the sidebar
      // can render a Pinned section without a second round-trip. The unique
      // constraint on (user_id, channel_id) keeps this bounded.
      pinnedBy: {
        where: { userId },
        select: { id: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Member count — two optional queries run in parallel, then a single
  // in-memory pass over channels:
  //  - public + visibleToAllTeams → total user count (one shared query)
  //  - public + allowedTeamIds    → groupBy teamId over the union of teamIds
  //  - private / otherwise        → _count.members + 1 (no DB query)
  const needsTotalUsers = channels.some((ch) => !ch.isPrivate && ch.visibleToAllTeams);
  const teamIdsUnion = new Set<string>(
    channels
      .filter((ch) => !ch.isPrivate && !ch.visibleToAllTeams && ch.allowedTeamIds.length > 0)
      .flatMap((ch) => ch.allowedTeamIds),
  );

  const [totalUserCount, teamUserRows] = await Promise.all([
    needsTotalUsers ? prisma.user.count() : Promise.resolve(0),
    teamIdsUnion.size === 0
      ? Promise.resolve([] as { teamId: string | null; _count: { _all: number } }[])
      : prisma.user.groupBy({
          by: ['teamId'],
          where: { teamId: { in: [...teamIdsUnion] } },
          _count: { _all: true },
        }),
  ]);

  // groupBy returns null teamId rows for users without a team — skip them.
  const userCountByTeamId = new Map<string, number>(
    teamUserRows
      .filter((r): r is { teamId: string; _count: { _all: number } } => r.teamId !== null)
      .map((r) => [r.teamId, r._count._all]),
  );

  const memberCountMap = buildMemberCountMap(channels, totalUserCount, userCountByTeamId);

  const result = channels.map((ch) => {
    const isPinned = ch.pinnedBy.length > 0;
    // Strip the join rows from the response — the boolean is all the
    // client needs and it keeps the payload small.
    const { pinnedBy: _pinnedBy, ...rest } = ch;
    return { ...rest, memberCount: memberCountMap.get(ch.id) ?? ch._count.members + 1, isPinned };
  });

  return NextResponse.json(result);
}

// POST /api/channels - Create channel (all authenticated users)
export async function POST(request: Request) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    name,
    description,
    isPrivate = false,
    memberIds = [],
    allowedTeamIds = [],
    visibleToAllTeams = false,
    purpose = 'discussion',
    teamId = null,
  } = await request.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  }

  const normalizedPurpose = purpose === 'assign_task' ? 'assign_task' : 'discussion';

  // Owning team — required when purpose=assign_task because every direct-assigned
  // task created in this channel inherits this team as task.assignedTeamId. The
  // Team Inbox query depends on this single source of truth (no more inferring
  // from allowedTeamIds).
  const cleanTeamId = typeof teamId === 'string' && teamId.length > 0 ? teamId : null;
  if (normalizedPurpose === 'assign_task' && !cleanTeamId) {
    return NextResponse.json(
      { error: 'Owning team is required for Assign Task channels' },
      { status: 400 },
    );
  }

  // Dedupe + sanitize team IDs (keep only non-empty strings)
  const cleanTeamIds = Array.isArray(allowedTeamIds)
    ? [...new Set(allowedTeamIds.filter((t: unknown) => typeof t === 'string' && t.length > 0))] as string[]
    : [];

  const channel = await prisma.channel.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      createdBy: session.user.id,
      isPrivate,
      allowedTeamIds: visibleToAllTeams ? [] : cleanTeamIds,
      visibleToAllTeams: !isPrivate && !!visibleToAllTeams,
      purpose: normalizedPurpose,
      teamId: cleanTeamId,
      ...(isPrivate && memberIds.length > 0
        ? {
            members: {
              create: memberIds.map((userId: string) => ({ userId })),
            },
          }
        : {}),
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      team: { select: { id: true, name: true } },
    },
  });

  // Post a Slack-style "channel created" system message. The renderer in
  // ChannelMessageItem looks for the marker and constructs the display text
  // using the channel's current name (so it stays in sync after renames).
  await prisma.channelMessage.create({
    data: {
      channelId: channel.id,
      senderId: session.user.id,
      content: '<!--system:channel_created-->',
      attachments: [],
      mentions: [],
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
