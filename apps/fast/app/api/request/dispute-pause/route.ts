import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// POST — Requester disputes a pause and resumes the task.
//
// Public endpoint authenticated by the task token (same pattern as
// /api/request GET and the /track comments endpoint). The requester proves
// they "own" this request by knowing the token slug from their original
// confirmation email / track URL — they don't need an app login to push
// back on a pause they think is unjustified.
//
// On success: clears the pending fields, restores the prior status, posts
// a system comment so the audit trail captures the dispute, and notifies
// the assignee + whoever paused the task. If no `comment` is provided we
// still resume the task and log a minimal system note.
export const POST = withErrorHandler(async (request: NextRequest) => {
    const body = await request.json().catch(() => ({}));
    const token = (body.token || '').toString().trim().toUpperCase();
    const comment = (body.comment || '').toString().trim();

    if (!token) return errorResponse('Token is required', 400);

    const task = await prisma.task.findFirst({
        where: { taskToken: token },
        select: {
            id: true,
            title: true,
            status: true,
            pendedFromStatus: true,
            pendedBy: true,
            requesterName: true,
            requesterEmail: true,
            assigneeId: true,
        },
    });
    if (!task) return errorResponse('Request not found', 404);
    if (task.status !== 'pending') {
        return errorResponse('This request is not currently paused', 400);
    }

    const restoreStatus = task.pendedFromStatus || 'in-progress';
    const noteBody = comment
        ? `🚫 Requester disputed the pause and resumed the task.\n\n"${comment}"`
        : '🚫 Requester disputed the pause and resumed the task.';

    // Resume + log the dispute as a comment in one transaction so we never
    // end up with a resumed task that's missing the audit trail (or a stray
    // dispute comment on a task that wasn't actually resumed).
    await prisma.$transaction([
        prisma.task.update({
            where: { id: task.id },
            data: {
                status: restoreStatus,
                pendingReason: null,
                pendingTag: null,
                pendedAt: null,
                pendedBy: null,
                pendedFromStatus: null,
            },
        }),
        prisma.taskComment.create({
            data: {
                taskId: task.id,
                authorName: task.requesterName || 'Requester',
                authorEmail: task.requesterEmail || null,
                message: noteBody,
                attachments: [],
            },
        }),
    ]);

    // Notify the assignee — they need to know their pause was overridden so
    // they can either accept it (work resumes) or escalate.
    const notifyIds = new Set<string>();
    if (task.assigneeId) notifyIds.add(task.assigneeId);
    if (task.pendedBy) notifyIds.add(task.pendedBy);

    if (notifyIds.size > 0) {
        await prisma.notification.createMany({
            data: Array.from(notifyIds).map(uid => ({
                userId: uid,
                type: 'task_pending_disputed',
                title: `${task.requesterName || 'The requester'} disputed your pause`,
                message: comment.length > 80
                    ? comment.substring(0, 80) + '…'
                    : (comment || `Task "${task.title}" was resumed by the requester.`),
                data: {
                    task_id: task.id,
                    task_title: task.title,
                    comment,
                },
            })),
        });
    }

    return successResponse({ id: task.id, status: restoreStatus });
});
