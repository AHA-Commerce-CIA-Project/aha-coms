import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { htmlToPlainText } from '@/lib/sanitize';

// GET — Fetch messages for a conversation (paginated)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const userId = session.user.id;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
        where: {
            conversationId_userId: { conversationId, userId },
        },
    });

    if (!participant) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const messages = await prisma.directMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor
            ? {
                cursor: { id: cursor },
                skip: 1,
            }
            : {}),
        include: {
            sender: {
                select: { id: true, name: true, image: true },
            },
            reactions: {
                include: { user: { select: { id: true, name: true } } },
            },
        },
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;

    return NextResponse.json({
        messages: data.map((m) => ({
            id: m.id,
            content: m.content,
            attachments: m.attachments || [],
            senderId: m.senderId,
            sender: { id: m.sender.id, name: m.sender.name, image: m.sender.image },
            type: (m as any).type || 'text',
            taskId: (m as any).taskId || null,
            taskSnapshot: (m as any).taskSnapshot || null,
            isEdited: (m as any).isEdited || false,
            reactions: m.reactions.map(r => ({ id: r.id, emoji: r.emoji, userId: r.userId, user: r.user })),
            createdAt: m.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? data[data.length - 1].id : null,
    });
}

// POST — Send a new message
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const userId = session.user.id;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
        where: {
            conversationId_userId: { conversationId, userId },
        },
    });

    if (!participant) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    const body = await request.json();
    const { content, attachments } = body;

    // Strip empty contenteditable HTML wrappers (e.g. "<br><div><br></div>") so
    // image-only sends don't persist visible cruft and leak into the DM list
    // preview. If plain-text content is empty after stripping tags, treat it
    // as no text at all.
    const trimmedContent = (content || '').trim();
    const plain = htmlToPlainText(trimmedContent);
    // Forward payloads with no prose are HTML-comment-only
    // (`<!--forward:{...}-->`) — htmlToPlainText returns '' for those, so a
    // marker-only forward without a typed message would 400 here even
    // though the receiver renders it as a real forward card.
    const hasForwardMarker = /<!--forward:.*?-->/s.test(trimmedContent);
    const messageContent = plain.length > 0 || hasForwardMarker ? trimmedContent : '';
    const messageAttachments = Array.isArray(attachments) ? attachments : [];

    // Must have content or attachments
    if (!messageContent && messageAttachments.length === 0) {
        return NextResponse.json({ error: 'Message content or attachments are required' }, { status: 400 });
    }

    // Critical path — create the message and respond. Side effects (sidebar
    // ordering bump, sender read-marker, recipient notification) are deferred
    // to a fire-and-forget block below so the perceived send latency stays
    // tight. Cloud Run keeps min=1 instance alive between requests, so the
    // deferred work resolves on the same instance without blocking the
    // response.
    const message = await prisma.directMessage.create({
        data: {
            conversationId,
            senderId: userId,
            content: messageContent,
            attachments: messageAttachments,
        },
        include: {
            sender: {
                select: { id: true, name: true, image: true },
            },
        },
    });

    void (async () => {
        try {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            });
            await prisma.conversationParticipant.update({
                where: { conversationId_userId: { conversationId, userId } },
                data: { lastReadAt: new Date() },
            });

            const otherParticipant = await prisma.conversationParticipant.findFirst({
                where: { conversationId, userId: { not: userId } },
            });
            if (!otherParticipant) return;

            const plainForNotif = htmlToPlainText(messageContent);
            let notifMessage = plainForNotif;
            if (!notifMessage && messageAttachments.length > 0) {
                notifMessage = `📎 Sent ${messageAttachments.length} file${messageAttachments.length > 1 ? 's' : ''}`;
            }
            await prisma.notification.create({
                data: {
                    userId: otherParticipant.userId,
                    type: 'dm_message',
                    title: `New message from ${session.user.name}`,
                    message: notifMessage.length > 80
                        ? notifMessage.substring(0, 80) + '...'
                        : notifMessage,
                    data: {
                        conversation_id: conversationId,
                        sender_id: userId,
                        sender_name: session.user.name,
                    },
                },
            });
        } catch (err) {
            console.error('DM POST side effects failed:', err);
        }
    })();

    // Canonical message shape — matches the GET response and the SSE payload
    // so the client doesn't need a special-case normaliser for the optimistic
    // send path. The previous shape (flat senderName/senderImage) only
    // worked because the prior client ignored the response and refetched.
    return NextResponse.json({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        sender: { id: message.sender.id, name: message.sender.name, image: message.sender.image },
        content: message.content,
        attachments: message.attachments || [],
        type: 'text',
        taskId: null,
        taskSnapshot: null,
        isEdited: false,
        reactions: [],
        createdAt: message.createdAt.toISOString(),
    }, { status: 201 });
}
