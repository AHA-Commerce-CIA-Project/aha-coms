import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — List all conversations for the current user
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const conversations = await prisma.conversation.findMany({
        where: {
            participants: {
                some: { userId },
            },
        },
        include: {
            participants: {
                include: {
                    user: {
                        select: { id: true, name: true, image: true, email: true },
                    },
                },
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                    sender: {
                        select: { id: true, name: true },
                    },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
    });

    // Map to a cleaner format
    const data = conversations.map((conv) => {
        const otherParticipant = conv.participants.find((p) => p.userId !== userId);
        const myParticipant = conv.participants.find((p) => p.userId === userId);
        const lastMessage = conv.messages[0] || null;

        // Count unread messages
        const lastReadAt = myParticipant?.lastReadAt;

        return {
            id: conv.id,
            otherUser: otherParticipant?.user || null,
            lastMessage: lastMessage
                ? {
                    id: lastMessage.id,
                    content: lastMessage.content,
                    senderId: lastMessage.senderId,
                    senderName: lastMessage.sender.name,
                    createdAt: lastMessage.createdAt.toISOString(),
                }
                : null,
            lastReadAt: lastReadAt?.toISOString() || null,
            updatedAt: conv.updatedAt.toISOString(),
        };
    });

    // Now get unread counts in a separate query for accuracy
    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts: Record<string, number> = {};

    for (const conv of conversations) {
        const myParticipant = conv.participants.find((p) => p.userId === userId);
        const lastReadAt = myParticipant?.lastReadAt;

        const count = await prisma.directMessage.count({
            where: {
                conversationId: conv.id,
                senderId: { not: userId },
                ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            },
        });
        unreadCounts[conv.id] = count;
    }

    const result = data.map((d) => ({
        ...d,
        unreadCount: unreadCounts[d.id] || 0,
    }));

    return NextResponse.json(result);
}

// POST — Create a new 1-on-1 conversation (or return existing)
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { otherUserId } = body;

    if (!otherUserId) {
        return NextResponse.json({ error: 'otherUserId is required' }, { status: 400 });
    }

    if (otherUserId === userId) {
        return NextResponse.json({ error: 'Cannot create conversation with yourself' }, { status: 400 });
    }

    // Check if the other user exists
    const otherUser = await prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true, name: true, image: true, email: true },
    });

    if (!otherUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if a conversation already exists between these two users
    const existingConversation = await prisma.conversation.findFirst({
        where: {
            AND: [
                { participants: { some: { userId } } },
                { participants: { some: { userId: otherUserId } } },
            ],
        },
        include: {
            participants: {
                include: {
                    user: {
                        select: { id: true, name: true, image: true, email: true },
                    },
                },
            },
        },
    });

    if (existingConversation) {
        return NextResponse.json({
            id: existingConversation.id,
            otherUser,
            isExisting: true,
        });
    }

    // Create new conversation with both participants
    const conversation = await prisma.conversation.create({
        data: {
            participants: {
                create: [
                    { userId },
                    { userId: otherUserId },
                ],
            },
        },
        include: {
            participants: {
                include: {
                    user: {
                        select: { id: true, name: true, image: true, email: true },
                    },
                },
            },
        },
    });

    return NextResponse.json({
        id: conversation.id,
        otherUser,
        isExisting: false,
    }, { status: 201 });
}
