import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// POST — Dismiss the Team Inbox "Overdue" bucket for a single task. The task
// still has a past dueDate; this just acknowledges it so the assignee's
// kanban shows it under In Progress instead of Overdue. Used when an assignee
// drags an overdue card back to In Progress.
//
// Authorization: only the current assignee can acknowledge their own card.
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireFastAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, status: true, assigneeId: true },
    });
    if (!task) return errorResponse('Task not found', 404);
    if (task.assigneeId !== session.user.id) {
        return errorResponse('Only the assignee can acknowledge this task', 403);
    }

    await prisma.task.update({
        where: { id },
        data: { overdueAcknowledgedAt: new Date() },
    });

    return successResponse({ id });
});
