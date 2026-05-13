import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-log';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// POST — Quick-complete a task from the Team Inbox kanban. Marks the task
// done with no resolution metadata; the assignee can fill that in later via
// the existing PATCH /complete endpoint within the 3-day edit window.
//
// Authorization: only the current assignee can mark their own task done.
// Leaders/admins are NOT given a back-door here — they can use the full
// complete modal which records who actually did the work.
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, title: true, status: true, assigneeId: true },
    });
    if (!task) return errorResponse('Task not found', 404);
    if (task.status === 'done') return errorResponse('Task is already completed', 400);
    if (task.assigneeId !== session.user.id) {
        return errorResponse('Only the assignee can mark this task complete', 403);
    }

    const updated = await prisma.task.update({
        where: { id },
        data: {
            status: 'done',
            completedAt: new Date(),
            completedBy: session.user.id,
        },
    });

    logActivity(session.user.id, 'task_completed', `Marked "${task.title}" complete`, 'task', id);

    return successResponse({ id: updated.id, status: updated.status, completedAt: updated.completedAt });
});
