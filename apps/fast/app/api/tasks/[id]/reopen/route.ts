import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// POST — Reopen a completed task back to in-progress. Used by the Team Inbox
// kanban when someone drags a Completed card back to In Progress.
//
// Authorization: only the assignee (or completer) can reopen their own task.
// Resolution metadata is preserved on the row so they can drop the card on
// Completed again to put it back without re-entering data.
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireFastAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, title: true, status: true, assigneeId: true, completedBy: true },
    });
    if (!task) return errorResponse('Task not found', 404);
    if (task.status !== 'done') return errorResponse('Task is not completed', 400);

    const isOwner = task.assigneeId === session.user.id || task.completedBy === session.user.id;
    if (!isOwner) {
        return errorResponse('Only the assignee can reopen this task', 403);
    }

    const updated = await prisma.task.update({
        where: { id },
        data: {
            status: 'in-progress',
            completedAt: null,
        },
    });

    logActivity(session.user.id, 'task_reopened', `Reopened "${task.title}"`, 'task', id);

    return successResponse({ id: updated.id, status: updated.status });
});
