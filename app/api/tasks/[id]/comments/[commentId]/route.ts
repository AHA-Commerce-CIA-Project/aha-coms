import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { sanitizeRichText, isHtml, htmlToPlainText } from '@/lib/sanitize';

// PATCH — Edit a task comment.
// Author can edit: authenticated user whose id matches authorUserId,
// OR a requester who holds the task token and originally authored the comment
// (no authorUserId, matching authorEmail optional).
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; commentId: string }> }
) {
    const { id: taskId, commentId } = await params;
    const body = await request.json();
    const { message, attachments, token, authorEmail } = body || {};

    if (typeof message !== 'string') {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    // Same sanitization rules as POST — HTML payloads from the rich editor
    // get cleaned through sanitize-html, plain text passes through. Reject
    // payloads that strip down to nothing visible.
    const rawMessage = message.trim();
    const cleanMessage = isHtml(rawMessage) ? sanitizeRichText(rawMessage) : rawMessage;
    const visibleText = isHtml(cleanMessage) ? htmlToPlainText(cleanMessage).trim() : cleanMessage;
    if (!visibleText) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const comment = await prisma.taskComment.findUnique({
        where: { id: commentId },
        select: { id: true, taskId: true, authorUserId: true, authorEmail: true },
    });
    if (!comment || comment.taskId !== taskId) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    let allowed = false;
    if (token) {
        // Requester path — token must match task AND comment must be a requester comment
        const task = await prisma.task.findFirst({
            where: { id: taskId, taskToken: token.toUpperCase() },
            select: { id: true },
        });
        if (task && !comment.authorUserId) {
            // If the original comment recorded an email, require it to match
            if (!comment.authorEmail || (authorEmail && comment.authorEmail === authorEmail)) {
                allowed = true;
            } else if (!authorEmail) {
                allowed = true;
            }
        }
    } else {
        const session = await requireAuth();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (comment.authorUserId === session.user.id) {
            allowed = true;
        }
    }

    if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await prisma.taskComment.update({
        where: { id: commentId },
        data: {
            message: cleanMessage,
            ...(Array.isArray(attachments) ? { attachments } : {}),
        },
    });

    return NextResponse.json({
        id: updated.id,
        author_name: updated.authorName,
        author_email: updated.authorEmail,
        author_user_id: updated.authorUserId,
        is_team: !!updated.authorUserId,
        message: updated.message,
        attachments: updated.attachments ?? [],
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString(),
        edited: updated.updatedAt.getTime() - updated.createdAt.getTime() > 1000,
    });
}
