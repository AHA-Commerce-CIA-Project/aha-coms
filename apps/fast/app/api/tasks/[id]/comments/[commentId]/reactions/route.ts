import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { mirrorReactionFromComment } from '@/lib/syncCommentReply';

// POST /api/tasks/[id]/comments/[commentId]/reactions - Toggle reaction
// Mirrors to the linked ThreadReply when the comment is part of a Direct
// Assign card sync.
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; commentId: string }> }
) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId, commentId } = await params;
    const { emoji } = await request.json();

    if (!emoji || typeof emoji !== 'string') {
        return NextResponse.json({ error: 'Emoji is required' }, { status: 400 });
    }

    const comment = await prisma.taskComment.findUnique({
        where: { id: commentId },
        select: { id: true, taskId: true },
    });
    if (!comment || comment.taskId !== taskId) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const existing = await prisma.messageReaction.findFirst({
        where: { userId: session.user.id, emoji, taskCommentId: commentId },
    });

    if (existing) {
        await prisma.messageReaction.delete({ where: { id: existing.id } });
        await mirrorReactionFromComment({
            userId: session.user.id,
            emoji,
            taskCommentId: commentId,
            action: 'removed',
        });
        return NextResponse.json({ action: 'removed' });
    } else {
        const reaction = await prisma.messageReaction.create({
            data: { userId: session.user.id, emoji, taskCommentId: commentId },
            include: { user: { select: { id: true, name: true } } },
        });
        await mirrorReactionFromComment({
            userId: session.user.id,
            emoji,
            taskCommentId: commentId,
            action: 'added',
        });
        return NextResponse.json({ action: 'added', reaction });
    }
}
