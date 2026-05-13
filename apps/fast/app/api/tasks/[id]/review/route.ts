import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';
import { taskReviewSchema, validate } from '@/lib/validations';

// POST — Submit a review for a completed task
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const { id: taskId } = await params;
    const body = await request.json();
    const parsed = validate(taskReviewSchema, body);
    if (!parsed.success) return parsed.response;

    const { reviewerType, rating, comment, reviewerEmail, taskToken } = parsed.data;

    // Fetch the task
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            status: true,
            requesterEmail: true,
            requesterName: true,
            taskToken: true,
            completedBy: true,
            completedByUser: { select: { name: true } },
        },
    });

    if (!task) {
        return errorResponse('Task not found', 404);
    }

    if (task.status !== 'done') {
        return errorResponse('Reviews can only be submitted for completed tasks', 400);
    }

    // Check if a review already exists for this reviewer type
    const existingReview = await prisma.taskReview.findUnique({
        where: { taskId_reviewerType: { taskId, reviewerType } },
    });

    if (existingReview) {
        return errorResponse('A review has already been submitted. Reviews can only be submitted once.', 409);
    }

    // Authorization based on reviewer type
    if (reviewerType === 'requester') {
        // Requester reviews are public (no auth), but we verify identity via email + token
        if (!reviewerEmail || !taskToken) {
            return errorResponse('Email and task token are required for requester reviews', 400);
        }

        if (task.taskToken !== taskToken.toUpperCase()) {
            return errorResponse('Invalid task token', 403);
        }

        // Verify email matches the requester — if the task has no requester email,
        // we can't verify, so we only allow if matching or if no email was recorded
        if (task.requesterEmail && task.requesterEmail.toLowerCase() !== reviewerEmail.toLowerCase()) {
            return errorResponse('Only the original requester can submit a review', 403);
        }

        const review = await prisma.taskReview.create({
            data: {
                taskId,
                reviewerType: 'requester',
                rating,
                comment: comment || null,
                reviewerName: task.requesterName,
                reviewerEmail: reviewerEmail.toLowerCase(),
            },
        });

        return successResponse(review, 201);

    } else if (reviewerType === 'completer') {
        // Completer reviews require authentication
        const session = await requireFastAuth();
        if (!session) {
            return errorResponse('Authentication required', 401);
        }

        // Verify the authenticated user is the one who completed the task
        if (task.completedBy !== session.user.id) {
            return errorResponse('Only the person who completed this task can submit a completer review', 403);
        }

        const review = await prisma.taskReview.create({
            data: {
                taskId,
                reviewerType: 'completer',
                rating,
                comment: comment || null,
                reviewerName: session.user.name,
                reviewerEmail: session.user.email,
            },
        });

        return successResponse(review, 201);
    }

    return errorResponse('Invalid reviewer type', 400);
});

// GET — Get reviews for a task (public)
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const { id: taskId } = await params;

    const reviews = await prisma.taskReview.findMany({
        where: { taskId },
        select: {
            id: true,
            reviewerType: true,
            rating: true,
            comment: true,
            reviewerName: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    return successResponse(reviews);
});
