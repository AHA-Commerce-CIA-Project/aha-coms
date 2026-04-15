import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-log';

// GET /api/channels/[channelId]/messages - Paginated messages
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
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const messages = await prisma.channelMessage.findMany({
    where: { channelId },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
      savedBy: {
        where: { userId: session.user.id },
        select: { id: true },
      },
      replies: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          createdAt: true,
          sender: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  return NextResponse.json({
    messages,
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
  });
}

// POST /api/channels/[channelId]/messages - Send message
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;
  const { content, attachments = [], mentions = [] } = await request.json();

  if ((!content || content.trim().length === 0) && attachments.length === 0) {
    return NextResponse.json({ error: 'Message content or attachments required' }, { status: 400 });
  }

  const message = await prisma.channelMessage.create({
    data: {
      channelId,
      senderId: session.user.id,
      content: content?.trim() || '',
      attachments,
      mentions,
    },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      reactions: true,
      savedBy: { where: { userId: session.user.id }, select: { id: true } },
    },
  });

  // Update channel updatedAt
  await prisma.channel.update({
    where: { id: channelId },
    data: { updatedAt: new Date() },
  });

  // Log activity
  logActivity(session.user.id, 'channel_message', `${session.user.name} posted a message in a channel`, 'channel', channelId);

  // Get channel info for notification
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true, isPrivate: true, createdBy: true },
  });

  // For private channels, only notify members + creator; for public, notify all
  let targetUsers: { id: string }[];
  if (channel?.isPrivate) {
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    if (channel.createdBy) memberIds.add(channel.createdBy);
    memberIds.delete(session.user.id);
    targetUsers = Array.from(memberIds).map((id) => ({ id }));
  } else {
    targetUsers = await prisma.user.findMany({
      where: { id: { not: session.user.id } },
      select: { id: true },
    });
  }

  const mentionSet = new Set(mentions);
  const notifications = targetUsers.map((u) => ({
    userId: u.id,
    type: mentionSet.has(u.id) ? 'mention' : 'channel_message',
    title: mentionSet.has(u.id)
      ? `${session.user.name} mentioned you in #${channel?.name || 'channel'}`
      : `${session.user.name} posted in #${channel?.name || 'channel'}`,
    message: content?.substring(0, 80) || 'sent an attachment',
    data: {
      channel_id: channelId,
      message_id: message.id,
      sender_id: session.user.id,
      sender_name: session.user.name,
    },
  }));

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }

  return NextResponse.json(message, { status: 201 });
}
