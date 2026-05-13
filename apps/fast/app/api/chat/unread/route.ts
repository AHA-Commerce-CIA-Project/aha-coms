import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Total unread DM count across all conversations
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all conversations the user is part of
    const participants = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true, lastReadAt: true },
    });

    let totalUnread = 0;

    for (const p of participants) {
        const count = await prisma.directMessage.count({
            where: {
                conversationId: p.conversationId,
                senderId: { not: userId },
                ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
            },
        });
        totalUnread += count;
    }

    return NextResponse.json({ unreadCount: totalUnread });
}
