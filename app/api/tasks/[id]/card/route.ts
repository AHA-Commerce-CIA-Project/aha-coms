import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Lightweight task snapshot for the "Direct Assign" channel card.
// Returns just enough to render claim/claimed/done state without pulling the full task record.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: {
            id: true,
            taskToken: true,
            title: true,
            urgency: true,
            status: true,
            source: true,
            claimedAt: true,
            completedAt: true,
            assigneeId: true,
            assignee: { select: { id: true, name: true, image: true } },
            requesterName: true,
            dueDate: true,
        },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    return NextResponse.json({
        id: task.id,
        task_token: task.taskToken,
        title: task.title,
        urgency: task.urgency,
        status: task.status,
        source: task.source,
        claimed_at: task.claimedAt?.toISOString() || null,
        completed_at: task.completedAt?.toISOString() || null,
        assignee: task.assignee
            ? { id: task.assignee.id, name: task.assignee.name, image: task.assignee.image }
            : null,
        requester_name: task.requesterName,
        due_date: task.dueDate?.toISOString() || null,
    });
}
