import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch messages for a conversation (paginated)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
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
            senderName: m.sender.name,
            senderImage: m.sender.image,
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
    const session = await requireAuth();
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

    // Must have content or attachments
    if ((!content || !content.trim()) && (!attachments || attachments.length === 0)) {
        return NextResponse.json({ error: 'Message content or attachments are required' }, { status: 400 });
    }

    // Create the message and update conversation timestamp
    const messageContent = content?.trim() || '';
    const messageAttachments = Array.isArray(attachments) ? attachments : [];

    const [message] = await prisma.$transaction([
        prisma.directMessage.create({
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
        }),
        prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        }),
        // Also update the sender's lastReadAt
        prisma.conversationParticipant.update({
            where: {
                conversationId_userId: { conversationId, userId },
            },
            data: { lastReadAt: new Date() },
        }),
    ]);

    // Create a notification for the other participant
    const otherParticipant = await prisma.conversationParticipant.findFirst({
        where: {
            conversationId,
            userId: { not: userId },
        },
    });

    if (otherParticipant) {
        let notifMessage = messageContent;
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
    }

    return NextResponse.json({
        id: message.id,
        content: message.content,
        attachments: message.attachments || [],
        senderId: message.senderId,
        senderName: message.sender.name,
        senderImage: message.sender.image,
        createdAt: message.createdAt.toISOString(),
    }, { status: 201 });
}
