import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// GET — List all milestones with progress for the current user.
// Anyone authenticated can read; only leaders can create/update/delete.
export const GET = withErrorHandler(async () => {
    const session = await requireFastAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const [milestones, doneCount] = await Promise.all([
        prisma.milestone.findMany({
            where: { active: true },
            orderBy: [{ type: 'asc' }, { threshold: 'asc' }],
            include: {
                claimedByUser: { select: { id: true, name: true, image: true } },
                createdBy: { select: { id: true, name: true } },
            },
        }),
        prisma.task.count({
            where: { status: 'done', completedBy: session.user.id },
        }),
    ]);

    const data = milestones.map((m) => {
        const reachedTimes = m.threshold > 0 ? Math.floor(doneCount / m.threshold) : 0;
        return {
            id: m.id,
            type: m.type,
            threshold: m.threshold,
            rewardLabel: m.rewardLabel,
            description: m.description,
            emoji: m.emoji,
            active: m.active,
            createdAt: m.createdAt.toISOString(),
            createdBy: m.createdBy ? { id: m.createdBy.id, name: m.createdBy.name } : null,
            // First-to-reach claim state
            claimedBy: m.claimedByUser
                ? { id: m.claimedByUser.id, name: m.claimedByUser.name, image: m.claimedByUser.image }
                : null,
            claimedAt: m.claimedAt?.toISOString() || null,
            // Per-user progress (relative to the caller)
            myProgress: {
                doneCount,
                reachedTimes,
                isClaimedByMe: m.claimedById === session.user.id,
                progressPercent: m.threshold > 0
                    ? Math.min(100, Math.round((doneCount / m.threshold) * 100))
                    : 0,
            },
        };
    });

    return successResponse({ milestones: data, myDoneCount: doneCount });
});

// POST — Create a new milestone (leader-only).
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireFastAuth();
    if (!session) return errorResponse('Unauthorized', 401);
    if (session.user.role !== 'leader' && session.user.role !== 'admin') {
        return errorResponse('Forbidden', 403);
    }

    const body = await request.json();
    const { type, threshold, rewardLabel, description, emoji } = body || {};

    if (type !== 'recurring' && type !== 'first') {
        return errorResponse('Invalid type — must be "recurring" or "first"', 400);
    }
    const t = Number(threshold);
    if (!Number.isFinite(t) || t < 1 || !Number.isInteger(t)) {
        return errorResponse('Threshold must be a positive integer', 400);
    }
    if (typeof rewardLabel !== 'string' || rewardLabel.trim().length === 0) {
        return errorResponse('Reward label is required', 400);
    }
    if (rewardLabel.length > 255) {
        return errorResponse('Reward label too long (max 255)', 400);
    }

    const created = await prisma.milestone.create({
        data: {
            type,
            threshold: t,
            rewardLabel: rewardLabel.trim(),
            description: typeof description === 'string' && description.trim()
                ? description.trim().slice(0, 2000)
                : null,
            emoji: typeof emoji === 'string' && emoji.trim()
                ? emoji.trim().slice(0, 10)
                : null,
            active: true,
            createdById: session.user.id,
        },
    });

    return successResponse(created, 201);
});

export const dynamic = 'force-dynamic';
