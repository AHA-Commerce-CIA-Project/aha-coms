import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// PATCH — Edit a DM message (sender only)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; msgId: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: conversationId, msgId } = await params;

    const msg = await prisma.directMessage.findFirst({
        where: { id: msgId, conversationId, senderId: session.user.id },
    });
    if (!msg) return NextResponse.json({ error: 'Message not found or not yours' }, { status: 404 });

    const { content } = await request.json();
    if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });

    const updated = await prisma.directMessage.update({
        where: { id: msgId },
        data: { content: content.trim(), isEdited: true },
    });

    return NextResponse.json({ ok: true, content: updated.content });
}

// DELETE — Delete a DM message (sender or leader/admin)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; msgId: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: conversationId, msgId } = await params;

    const msg = await prisma.directMessage.findFirst({
        where: { id: msgId, conversationId },
    });
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

    // Only sender or leader/admin can delete
    if (msg.senderId !== session.user.id) {
        const caller = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (caller?.role !== 'leader' && caller?.role !== 'admin') {
            return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
        }
    }

    await prisma.dmReaction.deleteMany({ where: { messageId: msgId } });
    await prisma.directMessage.delete({ where: { id: msgId } });

    return NextResponse.json({ ok: true });
}
