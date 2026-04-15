import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch direct request tasks assigned to current user (approved/in-progress)
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tasks = await prisma.task.findMany({
        where: {
            source: 'direct_request',
            assigneeId: session.user.id,
            status: { in: ['in-progress', 'review', 'done', 'pending_completion_details'] },
        },
        include: {
            assignee: { select: { name: true } },
            completedByUser: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    const data = tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        urgency: t.urgency,
        requester_name: t.requesterName,
        requester_email: t.requesterEmail,
        requester_division: t.requesterDivision,
        request_type: t.requestType,
        attachment_link: t.attachmentLink,
        image_url: t.attachmentLink,
        task_token: t.taskToken,
        completed_by: t.completedByUser?.name || t.completedBy || null,
        actual_time_spent: t.actualTimeSpent,
        time_unit: t.timeUnit,
        resolution_summary: t.resolutionSummary,
        due_date: t.dueDate,
        assignee_id: t.assigneeId,
        source: t.source,
        direct_assignee_id: t.directAssigneeId,
        created_at: t.createdAt.toISOString(),
        completed_at: t.completedAt?.toISOString() || null,
        assignee: t.assignee ? { name: t.assignee.name } : null,
    }));

    return NextResponse.json(data);
}
