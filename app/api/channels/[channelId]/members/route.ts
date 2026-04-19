import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels/[channelId]/members - List channel members
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { isPrivate: true, createdBy: true, allowedTeamIds: true },
  });

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const userSelect = {
    id: true,
    name: true,
    email: true,
    image: true,
    role: true,
  } as const;

  // Explicit ChannelMember rows (used for private, and as a union for public)
  const explicitMembers = await prisma.channelMember.findMany({
    where: { channelId },
    include: { user: { select: userSelect } },
  });

  const creator = await prisma.user.findUnique({
    where: { id: channel.createdBy },
    select: userSelect,
  });

  // Build the set of users that can see this channel, matching the
  // visibility rules used by GET /api/channels.
  const byId = new Map<string, any>();

  if (creator) byId.set(creator.id, { ...creator, isCreator: true });
  for (const m of explicitMembers) {
    if (!byId.has(m.user.id)) byId.set(m.user.id, { ...m.user, isCreator: false });
  }

  // For public channels with team scoping, also include users whose team
  // is in allowedTeamIds.
  if (!channel.isPrivate && channel.allowedTeamIds.length > 0) {
    const teamUsers = await prisma.user.findMany({
      where: { teamId: { in: channel.allowedTeamIds } },
      select: userSelect,
    });
    for (const u of teamUsers) {
      if (!byId.has(u.id)) byId.set(u.id, { ...u, isCreator: false });
    }
  }

  const memberList = Array.from(byId.values()).sort((a, b) => {
    if (a.isCreator) return -1;
    if (b.isCreator) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return NextResponse.json(memberList);
}
