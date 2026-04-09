import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// PUT — Mark conversation as read
export async function PUT(
    _request: NextRequest,
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

    await prisma.conversationParticipant.update({
        where: {
            conversationId_userId: { conversationId, userId },
        },
        data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ success: true });
}
