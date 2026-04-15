import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { notifyAllUsers } from '@/lib/notify-leaders';
import { sendRequestNotificationEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity-log';
import crypto from 'crypto';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';
import { requestSchema, validate } from '@/lib/validations';

// POST — Submit a new request (public, no auth required)
export const POST = withErrorHandler(async (request: NextRequest) => {
    const body = await request.json();
    const parsed = validate(requestSchema, body);
    if (!parsed.success) return parsed.response;

    const {
        requesterName, requesterDivision,
        requestType, title, urgency, description, dueDate, imageUrl,
        requesterEmail, isDirectRequest, directAssigneeId,
        fileUrls, referenceUrls,
    } = parsed.data;

    const taskToken = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Determine source and status based on direct request flag
    const isDirectReq = isDirectRequest && directAssigneeId;
    const taskSource = isDirectReq ? 'direct_request' : 'queue';
    const taskStatus = isDirectReq ? 'pending_approval' : 'todo';

    // Calculate response deadline for direct requests based on priority
    let responseDeadline: Date | null = null;
    if (isDirectReq) {
        const deadlineHours: Record<string, number> = {
            'P1': 1,
            'P2': 4,
            'P3': 24,
            'P4': 48,
            '5-minute': 0.5,
        };
        const hours = deadlineHours[urgency || 'P3'] ?? 24;
        responseDeadline = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const task = await prisma.task.create({
        data: {
            title,
            description,
            requesterName,
            requesterDivision: requesterDivision || null,
            requestType: requestType || 'fix_request',
            urgency: urgency || 'P3',
            status: taskStatus,
            source: taskSource,
            dueDate: dueDate ? (() => {
                // Calculate deadline: same time as now but on the selected date
                // e.g., submitted at 5PM, deadline Apr 16 = Apr 16 5PM
                const now = new Date();
                const selectedDate = new Date(dueDate);
                const deadlineDate = new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth(),
                    selectedDate.getDate(),
                    now.getHours(),
                    now.getMinutes(),
                    now.getSeconds(),
                );
                return deadlineDate;
            })() : null,
            attachmentLink: imageUrl || null,
            taskToken,
            customFields: { fileUrls, referenceUrls },
            ...(requesterEmail ? { requesterEmail } : {}),
            ...(isDirectReq ? { directAssigneeId, responseDeadline } : {}),
        },
        select: { taskToken: true, id: true },
    });

    // If direct request, notify the direct assignee
    if (isDirectReq) {
        await prisma.notification.create({
            data: {
                userId: directAssigneeId!,
                type: 'direct_request',
                title: 'New Direct Request',
                message: `${requesterName} sent you a direct request: "${title}"`,
                data: { task_id: task.id, task_token: task.taskToken },
            },
        });
    }

    // Notify leaders about new request (in-app)
    await notifyAllUsers(
        'task_updated',
        'New Request Submitted',
        `${requesterName} submitted a new request: "${title}"`,
        { task_id: task.id, task_token: task.taskToken }
    );

    // Log activity (use a system user ID or the task ID)
    logActivity(task.id, 'request_submitted', `${requesterName} submitted a new request: "${title}" (${urgency || 'P3'})`, 'task', task.id);

    // Send email notification
    sendRequestNotificationEmail({
        taskToken: task.taskToken!,
        requesterName,
        requesterDivision: requesterDivision || null,
        title,
        description,
        urgency: urgency || 'P3',
        requestType: requestType || 'fix_request',
        requesterEmail: requesterEmail || undefined,
    }).catch(() => {}); // Don't block response on email failure

    return successResponse({ taskToken: task.taskToken, id: task.id }, 201);
});

// GET — Lookup task by token (public, no auth required)
export const GET = withErrorHandler(async (request: NextRequest) => {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
        return errorResponse('Token parameter is required', 400);
    }

    const task = await prisma.task.findFirst({
        where: { taskToken: token.toUpperCase() },
        select: {
            id: true,
            taskToken: true,
            title: true,
            description: true,
            status: true,
            urgency: true,
            requestType: true,
            requesterName: true,
            requesterEmail: true,
            requesterDivision: true,
            assigneeId: true,
            createdAt: true,
            completedAt: true,
            dueDate: true,
            feedbackNotes: true,
            resolutionSummary: true,
            difficultyScore: true,
            attachmentLink: true,
            customFields: true,
            reviews: {
                select: {
                    id: true,
                    reviewerType: true,
                    rating: true,
                    comment: true,
                    reviewerName: true,
                    createdAt: true,
                },
            },
        },
    });

    if (!task) {
        return errorResponse('Request not found. Please check your token.', 404);
    }

    // Resolve assignee name if present
    let assigneeName: string | null = null;
    if (task.assigneeId) {
        const user = await prisma.user.findUnique({
            where: { id: task.assigneeId },
            select: { name: true },
        });
        assigneeName = user?.name || null;
    }

    // Map reviews
    const requesterReview = task.reviews.find(r => r.reviewerType === 'requester');
    const completerReview = task.reviews.find(r => r.reviewerType === 'completer');

    return successResponse({
        id: task.id,
        task_token: task.taskToken,
        title: task.title,
        description: task.description,
        status: task.status,
        urgency: task.urgency,
        request_type: task.requestType,
        requester_name: task.requesterName,
        requester_email: task.requesterEmail,
        requester_division: task.requesterDivision,
        assignee_id: task.assigneeId,
        created_at: task.createdAt.toISOString(),
        completed_at: task.completedAt?.toISOString() || null,
        due_date: task.dueDate?.toISOString() || null,
        feedback_notes: task.feedbackNotes,
        resolution_summary: task.resolutionSummary,
        difficulty_score: task.difficultyScore,
        image_url: task.attachmentLink,
        custom_fields: task.customFields,
        assignee_name: assigneeName,
        requester_review: requesterReview ? {
            rating: requesterReview.rating,
            comment: requesterReview.comment,
            reviewer_name: requesterReview.reviewerName,
            created_at: requesterReview.createdAt.toISOString(),
        } : null,
        completer_review: completerReview ? {
            rating: completerReview.rating,
            comment: completerReview.comment,
            reviewer_name: completerReview.reviewerName,
            created_at: completerReview.createdAt.toISOString(),
        } : null,
    });
});
