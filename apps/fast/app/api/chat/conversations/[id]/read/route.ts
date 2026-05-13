import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// PUT — Mark conversation as read
export async function PUT(
    _request: NextRequest,
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

    await prisma.conversationParticipant.update({
        where: {
            conversationId_userId: { conversationId, userId },
        },
        data: { lastReadAt: new Date() },
    });

    // Also clear the corresponding dm_message notifications so the bell badge
    // and the DMs tab in the notification dropdown sync to "read" the moment
    // the user actually opens the conversation. Without this, opening a DM
    // resets lastReadAt but leaves stale notifications visible — the exact
    // bug the user reported.
    await prisma.notification.updateMany({
        where: {
            userId,
            type: 'dm_message',
            read: false,
            data: {
                path: ['conversation_id'],
                equals: conversationId,
            },
        },
        data: { read: true },
    });

    return NextResponse.json({ success: true });
}
