import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';
import { htmlToPlainText } from '@/lib/sanitize';

// GET /api/channels/[channelId]/messages - Paginated messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireFastAuth();
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
    // TODO: Decide whether to filter null-sender messages at the source
    // vs. continue rendering them as placeholders. ChannelMessage.senderId
    // has onDelete: SetNull, so messages outlive their authors and the
    // `sender` include returns null for orphaned rows. The client
    // handles this defensively with a "Deleted User" fallback across
    // ChannelMessageItem / PinnedMessagesBanner / ThreadPanel / the
    // ChannelPane search-result UI (PR #20). If product decides
    // orphaned messages should disappear from the feed instead, add
    // `where: { senderId: { not: null } }` (and matching nullability in
    // the schema) here and remove the client fallbacks. Same call
    // applies to the pinned + replies + per-message search endpoints.
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

  // Return the user's lastReadAt for this channel so the client can anchor
  // its initial scroll at the first unread message instead of the bottom.
  // Only meaningful on the initial fetch (no cursor); paginated calls can
  // ignore it.
  let lastReadAt: string | null = null;
  if (!cursor) {
    const status = await prisma.channelReadStatus.findUnique({
      where: {
        channelId_userId: { channelId, userId: session.user.id },
      },
      select: { lastReadAt: true },
    });
    lastReadAt = status?.lastReadAt?.toISOString() ?? null;
  }

  return NextResponse.json({
    messages,
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
    lastReadAt,
  });
}

// POST /api/channels/[channelId]/messages - Send message
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;
  const { content, attachments = [], mentions = [] } = await request.json();

  // Strip empty contenteditable HTML wrappers (e.g. "<br><div><br></div>") so
  // image-only sends don't persist invisible cruft and leak into channel
  // previews.
  const trimmedContent = (content || '').trim();
  const plainContent = htmlToPlainText(trimmedContent);
  const messageContent = plainContent.length > 0 ? trimmedContent : '';

  if (!messageContent && attachments.length === 0) {
    return NextResponse.json({ error: 'Message content or attachments required' }, { status: 400 });
  }

  // Critical path: create the message and respond. Everything below the
  // response — channel.updatedAt bump, activity log, channel info fetch,
  // target-user fan-out, team-handle expansion, notification createMany —
  // ran inside the request before this rewrite, so a public channel with
  // N users paid an N-row prisma.user.findMany + N-row notification.
  // createMany cost on every send. That was the 3-5 second send latency
  // users were seeing. The new shape returns the message immediately and
  // defers the fan-out to a fire-and-forget block; min=1 Cloud Run keeps
  // the instance alive between requests, so deferred work completes on
  // the same instance without blocking the user.
  const message = await prisma.channelMessage.create({
    data: {
      channelId,
      senderId: session.user.id,
      content: messageContent,
      attachments,
      mentions,
    },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      reactions: true,
      savedBy: { where: { userId: session.user.id }, select: { id: true } },
    },
  });

  const senderId = session.user.id;
  const senderName = session.user.name;

  void (async () => {
    try {
      await prisma.channel.update({
        where: { id: channelId },
        data: { updatedAt: new Date() },
      });

      logActivity(senderId, 'channel_message', `${senderName} posted a message in a channel`, 'channel', channelId);

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { name: true, isPrivate: true, createdBy: true },
      });

      // For private channels, only notify members + creator; for public, notify all.
      let targetUsers: { id: string }[];
      if (channel?.isPrivate) {
        const members = await prisma.channelMember.findMany({
          where: { channelId },
          select: { userId: true },
        });
        const memberIds = new Set(members.map((m) => m.userId));
        if (channel.createdBy) memberIds.add(channel.createdBy);
        memberIds.delete(senderId);
        targetUsers = Array.from(memberIds).map((id) => ({ id }));
      } else {
        targetUsers = await prisma.user.findMany({
          where: { id: { not: senderId } },
          select: { id: true },
        });
      }

      const mentionSet = new Set<string>(mentions);

      // Expand team-handle mentions (@tfbi, @tpr, …) — pull each handle's
      // members into the mention set so they get a "you were mentioned"
      // notification.
      const handleMatches = new Set<string>();
      const plain = htmlToPlainText(content || '');
      for (const m of plain.matchAll(/@([a-z0-9][a-z0-9_-]{1,29})/gi)) {
        handleMatches.add(m[1].toLowerCase());
      }
      if (handleMatches.size > 0) {
        const teams = await prisma.team.findMany({
          where: { mentionHandle: { in: Array.from(handleMatches) } },
          select: {
            mentionHandle: true,
            users: { select: { id: true } },
          },
        });
        for (const t of teams) {
          for (const u of t.users) {
            if (u.id !== senderId) mentionSet.add(u.id);
          }
        }
      }

      const notifications = targetUsers.map((u) => ({
        userId: u.id,
        type: mentionSet.has(u.id) ? 'mention' : 'channel_message',
        title: mentionSet.has(u.id)
          ? `${senderName} mentioned you in #${channel?.name || 'channel'}`
          : `${senderName} posted in #${channel?.name || 'channel'}`,
        message: htmlToPlainText(content).substring(0, 80) || 'sent an attachment',
        data: {
          channel_id: channelId,
          message_id: message.id,
          sender_id: senderId,
          sender_name: senderName,
        },
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
      }
    } catch (err) {
      console.error('channel POST side effects failed:', err);
    }
  })();

  return NextResponse.json(message, { status: 201 });
}
