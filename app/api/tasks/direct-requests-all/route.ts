import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch all direct request tasks (leader/admin only)
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'leader' && user?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tasks = await prisma.task.findMany({
        where: { source: 'direct_request' },
        include: {
            assignee: { select: { name: true } },
            directAssignee: { select: { name: true } },
            completedByUser: { select: { name: true } },
            delegations: {
                include: {
                    fromUser: { select: { name: true } },
                    toUser: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const data = tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        urgency: t.urgency,
        task_token: t.taskToken,
        requester_name: t.requesterName,
        requester_division: t.requesterDivision,
        request_type: t.requestType,
        due_date: t.dueDate,
        created_at: t.createdAt.toISOString(),
        completed_at: t.completedAt?.toISOString() || null,
        completed_by: t.completedByUser?.name || t.completedBy || null,
        assignee_name: t.assignee?.name || null,
        direct_assignee_name: t.directAssignee?.name || null,
        attachment_link: t.attachmentLink,
        resolution_summary: t.resolutionSummary,
        response_deadline: t.responseDeadline?.toISOString() || null,
        delegations: t.delegations.map(d => ({
            from: d.fromUser.name,
            to: d.toUser.name,
            reason: d.reason,
            date: d.createdAt.toISOString(),
        })),
    }));

    return NextResponse.json(data);
}
