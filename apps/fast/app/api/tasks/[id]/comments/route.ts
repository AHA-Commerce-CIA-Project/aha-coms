import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { sanitizeRichText, isHtml, htmlToPlainText } from '@/lib/sanitize';
import { mirrorCommentToReply } from '@/lib/syncCommentReply';

// GET — Fetch comments for a task
// Public access with token, or authenticated
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const token = request.nextUrl.searchParams.get('token');

    // Verify access: either authenticated or has valid token
    if (!token) {
        const session = await requireFastAuth();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    } else {
        // Verify token matches the task
        const task = await prisma.task.findFirst({
            where: { id, taskToken: token.toUpperCase() },
            select: { id: true },
        });
        if (!task) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
        }
    }

    const comments = await prisma.taskComment.findMany({
        where: { taskId: id },
        include: {
            authorUser: { select: { name: true, image: true } },
            reactions: {
                include: { user: { select: { id: true, name: true } } },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(comments.map(c => ({
        id: c.id,
        author_name: c.authorName,
        author_email: c.authorEmail,
        author_user_id: c.authorUserId,
        author_image: c.authorUser?.image || null,
        is_team: !!c.authorUserId,
        message: c.message,
        attachments: c.attachments ?? [],
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt.toISOString(),
        edited: c.updatedAt.getTime() - c.createdAt.getTime() > 1000,
        // mirrored=true means this comment came from / is paired with the
        // source channel's thread reply. UI uses it to show a subtle "via
        // channel" indicator and gates whether reactions/edits also propagate.
        mirrored: !!c.mirrorReplyId,
        reactions: c.reactions.map(r => ({
            id: r.id,
            emoji: r.emoji,
            user_id: r.userId,
            user_name: r.user?.name || null,
            created_at: r.createdAt.toISOString(),
        })),
    })));
}

// POST — Add a comment
// Public with token+email, or authenticated
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { message, token, authorName, authorEmail, attachments } = body;

    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    // Comment composer now sends rich HTML when the user uses the formatting
    // toolbar or markdown shortcuts. Sanitize so we never persist scripts,
    // styles, or unknown attributes. Plain-text comments stay untouched
    // (sanitizeRichText is a no-op on tag-free input).
    const rawMessage = (message || '').trim();
    const cleanMessage = isHtml(rawMessage) ? sanitizeRichText(rawMessage) : rawMessage;
    // Reject HTML payloads that strip down to nothing visible (e.g. "<div><br></div>")
    // so empty comments don't leak through.
    const visibleText = isHtml(cleanMessage) ? htmlToPlainText(cleanMessage).trim() : cleanMessage;
    if (!visibleText && safeAttachments.length === 0) {
        return NextResponse.json({ error: 'Message or attachment is required' }, { status: 400 });
    }

    let commentData: any = {
        taskId: id,
        message: cleanMessage,
        attachments: safeAttachments,
    };

    let notifyAssigneeTask: { assigneeId: string; title: string; taskToken: string | null } | null = null;
    // Direct Assign cards (task.channelMessageId !== null) suppress the
    // task-comment notification & requester email — by request: comments on
    // these card modals are mirrored to the channel thread, and the channel
    // already drives its own thread notifications.
    let isCardTask = false;

    if (token) {
        // Public requester comment — verify token
        const task = await prisma.task.findFirst({
            where: { id, taskToken: token.toUpperCase() },
            select: { id: true, assigneeId: true, title: true, taskToken: true, channelMessageId: true },
        });
        if (!task) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
        }

        isCardTask = !!task.channelMessageId;

        commentData.authorName = authorName || 'Requester';
        commentData.authorEmail = authorEmail || null;

        // Defer notification until after the comment is created so we can attach comment_id
        if (task.assigneeId && !isCardTask) {
            notifyAssigneeTask = { assigneeId: task.assigneeId, title: task.title, taskToken: task.taskToken };
        }
    } else {
        // Authenticated team member comment
        const session = await requireFastAuth();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true, email: true },
        });

        commentData.authorUserId = session.user.id;
        commentData.authorName = user?.name || 'Team Member';
        commentData.authorEmail = user?.email || null;

        // Send email notification to requester (skipped for Direct Assign cards)
        const task = await prisma.task.findUnique({
            where: { id },
            select: { requesterEmail: true, requesterName: true, title: true, taskToken: true, channelMessageId: true },
        });

        isCardTask = !!task?.channelMessageId;

        if (task?.requesterEmail && !isCardTask) {
            // Fire-and-forget email
            const { sendViaAppsScript } = await import('@/lib/email');
            const { getAppUrl } = await import('@/lib/appUrl');
            const appUrl = getAppUrl();
            const trackUrl = `${appUrl}/track?token=${task.taskToken}`;
            sendViaAppsScript(
                [task.requesterEmail],
                `[FAST] New reply on your request: ${task.title}`,
                `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 20px 28px; border-radius: 12px 12px 0 0;">
                        <h2 style="color: #fff; margin: 0; font-size: 18px;">&#128172; New Reply on Your Request</h2>
                    </div>
                    <div style="padding: 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="color: #475569; font-size: 14px;">Hi ${task.requesterName || 'there'},</p>
                        <p style="color: #475569; font-size: 14px;"><strong>${commentData.authorName}</strong> replied to your request <strong>"${task.title}"</strong>:</p>
                        <div style="background: #F8FAFC; border-left: 3px solid #4F46E5; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
                            <p style="color: #334155; font-size: 14px; margin: 0;">${message.trim()}</p>
                        </div>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="${trackUrl}" style="display: inline-block; background: #0F0E7F; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">View & Reply</a>
                        </div>
                        <p style="color: #94A3B8; font-size: 11px; text-align: center; margin-top: 20px;">AHA COMSS - Company Support Systems</p>
                    </div>
                </div>`,
            ).catch(() => {});
        }
    }

    const comment = await prisma.taskComment.create({
        data: commentData,
    });

    if (notifyAssigneeTask) {
        await prisma.notification.create({
            data: {
                userId: notifyAssigneeTask.assigneeId,
                type: 'task_comment',
                title: 'New Comment on Task',
                message: `${commentData.authorName} commented on "${notifyAssigneeTask.title}": "${visibleText.substring(0, 80)}${visibleText.length > 80 ? '...' : ''}"`,
                data: { task_id: id, task_token: notifyAssigneeTask.taskToken, comment_id: comment.id },
            },
        });
    }

    // Mirror to the source channel's thread when the task is a Direct Assign
    // card. Best-effort — fire-and-forget so a mirror failure never blocks the
    // user-facing comment write.
    if (isCardTask) {
        await mirrorCommentToReply({
            commentId: comment.id,
            taskId: id,
            authorUserId: comment.authorUserId,
            message: comment.message,
            attachments: (comment.attachments ?? []) as any,
        });
    }

    return NextResponse.json({
        id: comment.id,
        author_name: comment.authorName,
        author_email: comment.authorEmail,
        author_user_id: comment.authorUserId,
        is_team: !!comment.authorUserId,
        message: comment.message,
        attachments: comment.attachments ?? [],
        created_at: comment.createdAt.toISOString(),
        updated_at: comment.updatedAt.toISOString(),
        edited: false,
    }, { status: 201 });
}
