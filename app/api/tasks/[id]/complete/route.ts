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
