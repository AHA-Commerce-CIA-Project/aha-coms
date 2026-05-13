import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';
import { updateTaskSchema, validate } from '@/lib/validations';

// DELETE — Delete a task (Leader only)
export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireFastAuth();
    if (!session) {
        return errorResponse('Unauthorized', 401);
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'admin') {
        return errorResponse('Master access required', 403);
    }

    const { id } = await params;

    // Delete related notifications first (non-blocking)
    try {
        await prisma.notification.deleteMany({
            where: {
                data: {
                    path: ['task_id'],
                    equals: id,
                },
            },
        });
    } catch { }

    await prisma.task.delete({ where: { id } });

    return successResponse({ deleted: true });
});

// PUT — Update a task (Leader only)
export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireFastAuth();
    if (!session) {
        return errorResponse('Unauthorized', 401);
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'leader' && user?.role !== 'admin') {
        return errorResponse('Leader access required', 403);
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = validate(updateTaskSchema, body);
    if (!parsed.success) return parsed.response;

    const { title, description, urgency, status, due_date, request_type } = parsed.data;

    const allowedFields: Record<string, any> = {};
    if (title !== undefined) allowedFields.title = title;
    if (description !== undefined) allowedFields.description = description;
    if (urgency !== undefined) allowedFields.urgency = urgency;
    if (status !== undefined) allowedFields.status = status;
    if (due_date !== undefined) allowedFields.dueDate = due_date ? new Date(due_date) : null;
    if (request_type !== undefined) allowedFields.requestType = request_type;

    const data = await prisma.task.update({
        where: { id },
        data: allowedFields,
    });

    return successResponse(data);
});
