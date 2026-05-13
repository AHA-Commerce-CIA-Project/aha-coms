import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// POST — Toggle a reaction on a DM message
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; msgId: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: conversationId, msgId } = await params;
    const { emoji } = await request.json();

    if (!emoji) return NextResponse.json({ error: 'Emoji required' }, { status: 400 });

    // Verify participant
    const participant = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: session.user.id },
    });
    if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

    // Toggle: if exists remove, else add
    const existing = await prisma.dmReaction.findUnique({
        where: { userId_emoji_messageId: { userId: session.user.id, emoji, messageId: msgId } },
    });

    if (existing) {
        await prisma.dmReaction.delete({ where: { id: existing.id } });
        return NextResponse.json({ action: 'removed' });
    }

    await prisma.dmReaction.create({
        data: { emoji, userId: session.user.id, messageId: msgId },
    });

    return NextResponse.json({ action: 'added' });
}
