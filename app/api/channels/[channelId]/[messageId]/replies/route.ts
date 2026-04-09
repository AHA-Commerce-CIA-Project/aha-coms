import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels/[channelId]/[messageId]/replies
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageId } = await params;

  const replies = await prisma.threadReply.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(replies);
}

// POST /api/channels/[channelId]/[messageId]/replies
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId, messageId } = await params;
  const { content, attachments = [], mentions = [] } = await request.json();

  if ((!content || content.trim().length === 0) && attachments.length === 0) {
    return NextResponse.json({ error: 'Content or attachments required' }, { status: 400 });
  }

  const [reply] = await prisma.$transaction([
    prisma.threadReply.create({
      data: {
        messageId,
        senderId: session.user.id,
        content: content?.trim() || '',
        attachments,
        mentions,
      },
      include: {
        sender: { select: { id: true, name: true, image: true } },
        reactions: [],
      },
    }),
    prisma.channelMessage.update({
      where: { id: messageId },
      data: { replyCount: { increment: 1 } },
    }),
    prisma.channel.update({
      where: { id: channelId },
      data: { updatedAt: new Date() },
    }),
  ]);

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
    type: mentionSet.has(u.id) ? 'mention' : 'channel_reply',
    title: mentionSet.has(u.id)
      ? `${session.user.name} mentioned you in a thread in #${channel?.name || 'channel'}`
      : `${session.user.name} replied in a thread in #${channel?.name || 'channel'}`,
    message: content?.substring(0, 80) || 'sent an attachment',
    data: {
      channel_id: channelId,
      message_id: messageId,
      sender_id: session.user.id,
      sender_name: session.user.name,
    },
  }));

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }

  return NextResponse.json(reply, { status: 201 });
}
