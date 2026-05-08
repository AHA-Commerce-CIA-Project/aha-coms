import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// Allowed structured tags for the "why is this paused" picker. Free-text
// reason (`pendingReason`) supplements whatever the user picks. Kept tight
// so reporting later can group by tag without fuzzy-matching free text.
const ALLOWED_TAGS = new Set([
    'waiting_on_brand',
    'waiting_on_partner',
    'waiting_on_internal',
    'waiting_on_user',
    'other',
]);

// Anyone with a stake in the task may pause/resume it. We allow:
//  - the current assignee
//  - the direct-assign assignee (claimed or unclaimed direct-assign tasks)
//  - the requester (so they can mark "I'm waiting on confirmation" themselves)
//  - leaders (overrides everything for ops support)
async function canManagePending(taskId: string, userId: string): Promise<boolean> {
    const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, email: true },
    });
    if (me?.role === 'admin' || me?.role === 'leader') return true;

    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { assigneeId: true, directAssigneeId: true, requesterEmail: true },
    });
    if (!task) return false;
    if (task.assigneeId === userId) return true;
    if (task.directAssigneeId === userId) return true;
    if (task.requesterEmail && me?.email && task.requesterEmail.toLowerCase() === me.email.toLowerCase()) return true;
    return false;
}

// POST — Mark task as Pending. Body: { reason: string, tag?: string }.
// Snapshots the current status into pendedFromStatus so we can restore it
// later. Notifies the requester so they can chase the blocker if needed.
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = (body.reason || '').toString().trim();
    const tag = body.tag && ALLOWED_TAGS.has(body.tag) ? body.tag : null;

    if (!reason) return errorResponse('Reason is required', 400);

    if (!(await canManagePending(id, session.user.id))) {
        return errorResponse('Not authorized to pause this task', 403);
    }

    const existing = await prisma.task.findUnique({
        where: { id },
        select: { id: true, title: true, status: true, requesterEmail: true, assigneeId: true },
    });
    if (!existing) return errorResponse('Task not found', 404);
    if (existing.status === 'pending') {
        return errorResponse('Task is already pending', 400);
    }
    if (existing.status === 'done') {
        return errorResponse('Cannot pause a completed task', 400);
    }

    await prisma.task.update({
        where: { id },
        data: {
            pendedFromStatus: existing.status,
            status: 'pending',
            pendingReason: reason,
            pendingTag: tag,
            pendedAt: new Date(),
            pendedBy: session.user.id,
        },
    });

    // Notify the requester so they know their request is paused and why.
    if (existing.requesterEmail) {
        const requester = await prisma.user.findFirst({
            where: { email: existing.requesterEmail },
            select: { id: true },
        });
        if (requester && requester.id !== session.user.id) {
            await prisma.notification.create({
                data: {
                    userId: requester.id,
                    type: 'task_pending',
                    title: `${session.user.name} paused your task`,
                    message: reason.length > 80 ? reason.substring(0, 80) + '…' : reason,
                    data: {
                        task_id: id,
                        task_title: existing.title,
                        reason,
                        tag,
                    },
                },
            });
        }
    }

    // Also ping the assignee if someone else (e.g. a leader) paused on their behalf.
    if (existing.assigneeId && existing.assigneeId !== session.user.id) {
        await prisma.notification.create({
            data: {
                userId: existing.assigneeId,
                type: 'task_pending',
                title: `${session.user.name} paused: ${existing.title}`,
                message: reason.length > 80 ? reason.substring(0, 80) + '…' : reason,
                data: { task_id: id, reason, tag },
            },
        });
    }

    return successResponse({ id });
});

// DELETE — Resume a paused task. Restores the prior status from
// pendedFromStatus and clears the pending fields. Notifies requester
// and assignee that the task is moving again.
export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    if (!(await canManagePending(id, session.user.id))) {
        return errorResponse('Not authorized to resume this task', 403);
    }

    const existing = await prisma.task.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            status: true,
            pendedFromStatus: true,
            requesterEmail: true,
            assigneeId: true,
        },
    });
    if (!existing) return errorResponse('Task not found', 404);
    if (existing.status !== 'pending') {
        return errorResponse('Task is not pending', 400);
    }

    // Default fallback if pendedFromStatus is missing (legacy/dirty data) is
    // 'in-progress' — that's the safest active state for a resumed task.
    const restoreStatus = existing.pendedFromStatus || 'in-progress';

    await prisma.task.update({
        where: { id },
        data: {
            status: restoreStatus,
            pendingReason: null,
            pendingTag: null,
            pendedAt: null,
            pendedBy: null,
            pendedFromStatus: null,
        },
    });

    if (existing.requesterEmail) {
        const requester = await prisma.user.findFirst({
            where: { email: existing.requesterEmail },
            select: { id: true },
        });
        if (requester && requester.id !== session.user.id) {
            await prisma.notification.create({
                data: {
                    userId: requester.id,
                    type: 'task_resumed',
                    title: `${session.user.name} resumed your task`,
                    message: existing.title.length > 80 ? existing.title.substring(0, 80) + '…' : existing.title,
                    data: { task_id: id, task_title: existing.title },
                },
            });
        }
    }

    if (existing.assigneeId && existing.assigneeId !== session.user.id) {
        await prisma.notification.create({
            data: {
                userId: existing.assigneeId,
                type: 'task_resumed',
                title: `${session.user.name} resumed: ${existing.title}`,
                message: 'Task moved back to active state',
                data: { task_id: id },
            },
        });
    }

    return successResponse({ id, status: restoreStatus });
});
