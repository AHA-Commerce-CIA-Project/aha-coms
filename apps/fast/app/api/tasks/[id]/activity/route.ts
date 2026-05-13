import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// Collaboration-related activity actions shown in the task's help panel timeline.
const HELP_ACTIONS = [
    'task_help_requested',
    'task_help_request_cancelled',
    'task_help_requested_to_join',
    'task_help_approved',
    'task_help_denied',
    'task_help_left',
    'task_help_offer_withdrawn',
    // Also show initial claim/assignment so the timeline starts with who took the task on.
    'task_claimed',
    'task_assigned',
    // Completion too, for context.
    'task_completed',
];

// GET — Return the help-panel activity timeline for a task.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const rows = await prisma.activityLog.findMany({
        where: {
            entityType: 'task',
            entityId: id,
            action: { in: HELP_ACTIONS },
        },
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(rows.map(r => ({
        id: r.id,
        action: r.action,
        description: r.description,
        created_at: r.createdAt.toISOString(),
        user: r.user ? { id: r.user.id, name: r.user.name, image: r.user.image } : null,
    })));
}
