import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { notifyLeaders } from '@/lib/notify-leaders';
import { sendTaskCompletedEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity-log';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';
import { completeTaskSchema, validate } from '@/lib/validations';

// PUT — Complete a task
export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) {
        return errorResponse('Unauthorized', 401);
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = validate(completeTaskSchema, body);
    if (!parsed.success) return parsed.response;

    const {
        completedBy, difficultyScore, actualTimeSpent,
        timeUnit, resolutionSummary, completedAt
    } = parsed.data;

    const task = await prisma.task.update({
        where: { id },
        data: {
            status: 'done',
            completedAt: completedAt ? new Date(completedAt) : new Date(),
            completedBy: session.user.id, // Ensure this is a valid User ID, not a name
            difficultyScore: difficultyScore || null,
            actualTimeSpent: actualTimeSpent || null,
            timeUnit: timeUnit || 'minutes',
            resolutionSummary: resolutionSummary || null,
        },
    });

    // Auto-claim any first-to-reach milestones the completer just qualified for.
    // Recurring milestones aren't recorded — they're computed from done count
    // on read, since by definition they apply to anyone who reaches X.
    try {
        const doneCount = await prisma.task.count({
            where: { status: 'done', completedBy: session.user.id },
        });
        const eligible = await prisma.milestone.findMany({
            where: {
                type: 'first',
                active: true,
                claimedById: null,
                threshold: { lte: doneCount },
            },
        });
        for (const m of eligible) {
            // Atomic claim: only succeeds if still unclaimed.
            await prisma.milestone.updateMany({
                where: { id: m.id, claimedById: null },
                data: { claimedById: session.user.id, claimedAt: new Date() },
            });
        }
    } catch {
        // Don't fail the completion if milestone claim has trouble
    }

    // Notify leaders about task completion
    await notifyLeaders(
        'task_updated',
        'Task Completed',
        `${completedBy || 'A member'} completed task: "${task.title}"`,
        { task_id: id, task_token: task.taskToken }
    );

    // Log activity
    logActivity(session.user.id, 'task_completed', `${completedBy || session.user.name} completed task "${task.title}"`, 'task', id);

    // Send email notification
    if (task.taskToken) {
        sendTaskCompletedEmail({
            taskToken: task.taskToken,
            title: task.title,
            requesterName: task.requesterName || 'Requester',
            completedByName: completedBy || session.user.name || 'A team member',
            resolutionSummary: resolutionSummary || null,
            requesterEmail: task.requesterEmail || undefined,
        }).catch(() => {});
    }

    return successResponse(task);
});

// PATCH — Edit a completed task's assessment.
// Permitted only to the original completer, only while the task is still in
// Done status. No time-based edit window — once status changes (e.g. reopened
// or archived), the assessment becomes immutable.
export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            status: true,
            completedBy: true,
            customFields: true,
        },
    });
    if (!task) return errorResponse('Task not found', 404);
    if (task.status !== 'done') {
        return errorResponse('Assessment can only be edited while the task is in Done status', 400);
    }

    const userId = session.user.id;
    if (task.completedBy !== userId) {
        return errorResponse('Only the original completer can edit this assessment', 403);
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.difficultyScore !== undefined) {
        data.difficultyScore = body.difficultyScore || null;
    }
    if (body.actualTimeSpent !== undefined) {
        const n = Number(body.actualTimeSpent);
        data.actualTimeSpent = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (body.timeUnit !== undefined) {
        data.timeUnit = body.timeUnit || 'minutes';
    }
    if (body.resolutionSummary !== undefined) {
        data.resolutionSummary = body.resolutionSummary || null;
    }

    const existingCustom = (task.customFields ?? {}) as Record<string, unknown>;
    data.customFields = {
        ...existingCustom,
        assessment_edited_at: new Date().toISOString(),
    };

    const updated = await prisma.task.update({ where: { id }, data });

    logActivity(
        userId,
        'task_updated',
        `${session.user.name || 'Someone'} edited completion assessment for "${updated.title}"`,
        'task',
        id,
    );

    return successResponse(updated);
});
