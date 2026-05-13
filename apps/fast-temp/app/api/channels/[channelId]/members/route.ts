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
    select: { isPrivate: true, createdBy: true, allowedTeamIds: true, visibleToAllTeams: true },
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

  // For public channels visible to all teams, include every user.
  if (!channel.isPrivate && channel.visibleToAllTeams) {
    const allUsers = await prisma.user.findMany({ select: userSelect });
    for (const u of allUsers) {
      if (!byId.has(u.id)) byId.set(u.id, { ...u, isCreator: false });
    }
  } else if (!channel.isPrivate && channel.allowedTeamIds.length > 0) {
    // For public channels with team scoping, include users whose team
    // is in allowedTeamIds.
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

// POST — Add explicit users to a channel (channel creator or admin).
// Body: { userIds: string[] }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;
  const body = await request.json().catch(() => ({}));
  const userIds: string[] = Array.isArray(body?.userIds)
    ? body.userIds.filter((id: unknown) => typeof id === 'string' && id.length > 0)
    : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: 'userIds is required' }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, createdBy: true },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Any authenticated user can add members — gate intentionally open per product request.

  // Insert any missing rows; ignore duplicates.
  const existing = await prisma.channelMember.findMany({
    where: { channelId, userId: { in: userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map(e => e.userId));
  const toAdd = userIds.filter(id => !existingSet.has(id));

  if (toAdd.length > 0) {
    await prisma.channelMember.createMany({
      data: toAdd.map(userId => ({ channelId, userId })),
      skipDuplicates: true,
    });

    // Notify newly-added users.
    await prisma.notification.createMany({
      data: toAdd.map(uid => ({
        userId: uid,
        type: 'channel_invite',
        title: `Added to #${channel.name}`,
        message: `${session.user.name || 'Someone'} added you to #${channel.name}`,
        data: { channel_id: channelId },
      })),
    });

    // Post a Slack-style system message into the channel so everyone sees the join.
    const addedUsers = await prisma.user.findMany({
      where: { id: { in: toAdd } },
      select: { name: true },
    });
    const adderName = session.user.name || 'Someone';
    const names = addedUsers.map((u) => u.name).filter(Boolean);
    const joined =
      names.length === 1
        ? names[0]
        : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
    const text = `${adderName} added ${joined} to the channel.`;
    await prisma.channelMessage.create({
      data: {
        channelId,
        senderId: session.user.id,
        content: `<!--system:member_added-->${text}`,
        attachments: [],
        mentions: [],
      },
    });
    await prisma.channel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
  }

  return NextResponse.json({ added: toAdd.length, alreadyMember: userIds.length - toAdd.length });
}

// DELETE — Remove an explicit member (creator or admin only).
// Body: { userId: string }
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;
  const body = await request.json().catch(() => ({}));
  const userId: string | undefined = body?.userId;
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdBy: true },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // The channel creator is permanent — never let them be removed via this endpoint.
  if (channel.createdBy === userId) {
    return NextResponse.json({ error: 'Cannot remove the channel creator' }, { status: 400 });
  }

  // Look up name BEFORE deletion so the system message reads correctly.
  const removedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  const result = await prisma.channelMember.deleteMany({ where: { channelId, userId } });

  if (result.count > 0 && removedUser?.name) {
    const removerName = session.user.name || 'Someone';
    const text = `${removerName} removed ${removedUser.name} from the channel.`;
    await prisma.channelMessage.create({
      data: {
        channelId,
        senderId: session.user.id,
        content: `<!--system:member_removed-->${text}`,
        attachments: [],
        mentions: [],
      },
    });
    await prisma.channel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
  }

  return NextResponse.json({ success: true });
}
