import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

function isLeader(role: string | undefined): boolean {
    return role === 'leader' || role === 'admin';
}

// PATCH — Update a milestone (leader-only). Allowed fields: rewardLabel,
// description, emoji, threshold, active. Type cannot change after creation.
export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireFastAuth();
    if (!session) return errorResponse('Unauthorized', 401);
    if (!isLeader(session.user.role)) return errorResponse('Forbidden', 403);

    const { id } = await params;
    const existing = await prisma.milestone.findUnique({ where: { id } });
    if (!existing) return errorResponse('Milestone not found', 404);

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.rewardLabel !== undefined) {
        if (typeof body.rewardLabel !== 'string' || body.rewardLabel.trim().length === 0) {
            return errorResponse('Reward label is required', 400);
        }
        data.rewardLabel = body.rewardLabel.trim().slice(0, 255);
    }
    if (body.description !== undefined) {
        data.description = typeof body.description === 'string' && body.description.trim()
            ? body.description.trim().slice(0, 2000)
            : null;
    }
    if (body.emoji !== undefined) {
        data.emoji = typeof body.emoji === 'string' && body.emoji.trim()
            ? body.emoji.trim().slice(0, 10)
            : null;
    }
    if (body.threshold !== undefined) {
        const t = Number(body.threshold);
        if (!Number.isFinite(t) || t < 1 || !Number.isInteger(t)) {
            return errorResponse('Threshold must be a positive integer', 400);
        }
        data.threshold = t;
    }
    if (body.active !== undefined) {
        data.active = !!body.active;
    }

    const updated = await prisma.milestone.update({ where: { id }, data });
    return successResponse(updated);
});

// DELETE — Remove a milestone (leader-only).
export const DELETE = withErrorHandler(async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireFastAuth();
    if (!session) return errorResponse('Unauthorized', 401);
    if (!isLeader(session.user.role)) return errorResponse('Forbidden', 403);

    const { id } = await params;
    const existing = await prisma.milestone.findUnique({ where: { id } });
    if (!existing) return errorResponse('Milestone not found', 404);

    await prisma.milestone.delete({ where: { id } });
    return successResponse({ id });
});
