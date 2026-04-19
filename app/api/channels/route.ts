import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels - List channels visible to current user
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch the user's team so we can filter by allowedTeamIds
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  const myTeamId = me?.teamId ?? null;

  // Access rules (any condition grants visibility):
  //  - creator of the channel
  //  - explicit member (ChannelMember row)
  //  - user's team is in the channel's allowedTeamIds list
  // Additionally, private channels require creator or explicit membership.
  const channels = await prisma.channel.findMany({
    where: {
      isArchived: false,
      OR: [
        { createdBy: userId },
        { members: { some: { userId } } },
        ...(myTeamId
          ? [{ isPrivate: false, allowedTeamIds: { has: myTeamId } }]
          : []),
      ],
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { messages: true, members: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Member count: private uses explicit members + creator; public counts
  // users whose team is in allowedTeamIds (best-effort).
  const result = await Promise.all(
    channels.map(async (ch) => {
      let memberCount = ch._count.members + 1; // creator + explicit members
      if (!ch.isPrivate && ch.allowedTeamIds.length > 0) {
        memberCount = await prisma.user.count({
          where: { teamId: { in: ch.allowedTeamIds } },
        });
      }
      return { ...ch, memberCount };
    })
  );

  return NextResponse.json(result);
}

// POST /api/channels - Create channel (all authenticated users)
export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, description, isPrivate = false, memberIds = [], allowedTeamIds = [] } = await request.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
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
      allowedTeamIds: cleanTeamIds,
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
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
