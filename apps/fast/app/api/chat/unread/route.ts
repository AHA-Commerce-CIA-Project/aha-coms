import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Total unread DM count across all conversations
export async function GET() {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all conversations the user is part of
    const participants = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true, lastReadAt: true },
    });

    if (participants.length === 0) {
        return NextResponse.json({ unreadCount: 0 });
    }

    // Partition: no cursor → every non-self DM counts; with cursor → only newer messages count.
    const noCursor = participants.filter(p => p.lastReadAt === null);
    const withCursor = participants.filter(p => p.lastReadAt !== null);

    const [unreadNoCursor, unreadWithCursor] = await Promise.all([
        noCursor.length === 0
            ? Promise.resolve(0)
            : prisma.directMessage.count({
                where: {
                    conversationId: { in: noCursor.map(p => p.conversationId) },
                    senderId: { not: userId },
                },
            }),
        withCursor.length === 0
            ? Promise.resolve(0)
            : prisma.directMessage.count({
                where: {
                    senderId: { not: userId },
                    OR: withCursor.map(p => ({
                        conversationId: p.conversationId,
                        createdAt: { gt: p.lastReadAt! },
                    })),
                },
            }),
    ]);

    return NextResponse.json({ unreadCount: unreadNoCursor + unreadWithCursor });
}
