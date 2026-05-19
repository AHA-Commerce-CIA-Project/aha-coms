import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Direct Tasks for the current user. Powers the "Direct Tasks" tab
// on /tasks (was "Direct Requests" pre-PR #53). Two task populations
// roll up into this bucket:
//
//   1. Leader-assigned direct-request tasks where the caller is the
//      assignee — source='direct_request'. Original shape; tested in
//      route.test.ts (the status whitelist is the load-bearing piece).
//   2. Self-assigned personal cards created via /api/tasks/self —
//      source='direct_assign', requesterEmail = caller.email, and the
//      caller is also the assignee. Before PR #53 these landed only in
//      the /my-request Command Center, which was wrong: a self-assigned
//      task is not a "request from me" — it's a direct task I owe
//      myself. The expansion below pulls them into the same query so
//      they show up alongside leader-assigned direct tasks.
//
// Both populations share the same status whitelist so on-hold cards
// stay visible (matches the 2026-05-13 fix documented in the test
// file at apps/fast/app/api/tasks/my-direct-requests/route.test.ts).
export async function GET() {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const personalArchived = await prisma.userArchivedTask.findMany({
        where: { userId: session.user.id },
        select: { taskId: true },
    });
    const archivedSet = new Set(personalArchived.map(p => p.taskId));

    const tasks = await prisma.task.findMany({
        where: {
            assigneeId: session.user.id,
            // 'pending' is the DB status for tasks the assignee has put On Hold
            // (the /api/tasks/[id]/pending route flips status to 'pending' and
            // snapshots the prior status into pendedFromStatus). Without it
            // here, on-hold tasks vanish from the assignee's own list while
            // still showing for admins via /api/tasks/direct-requests-all.
            status: { in: ['in-progress', 'review', 'done', 'pending_completion_details', 'pending'] },
            // Source OR — direct_request (leader-assigned) OR direct_assign
            // where the caller is also the requester (self-assigned Create
            // Card flow). Anything else (queue / form / routine) lives in
            // its own surface and shouldn't bleed in here. The
            // requesterEmail predicate keeps leader-created direct_assigns
            // (where someone else is the requester and the caller is the
            // claimer) out of this bucket — those still surface in the
            // Team Inbox channel feed, not under Direct Tasks.
            OR: [
                { source: 'direct_request' },
                { source: 'direct_assign', requesterEmail: { equals: session.user.email } },
            ],
        },
        include: {
            assignee: { select: { name: true } },
            completedByUser: { select: { name: true } },
            _count: { select: { collaborators: { where: { status: 'approved' } } } },
            collaborators: {
                where: { status: 'approved' },
                include: { user: { select: { id: true, name: true, image: true } } },
                orderBy: { joinedAt: 'asc' },
            },
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
        custom_fields: t.customFields,
        difficulty_score: t.difficultyScore,
        request_type: t.requestType,
        attachment_link: t.attachmentLink,
        image_url: t.attachmentLink,
        task_token: t.taskToken,
        completed_by: t.completedByUser?.name || t.completedBy || null,
        completed_by_id: t.completedBy || null,
        actual_time_spent: t.actualTimeSpent,
        time_unit: t.timeUnit,
        resolution_summary: t.resolutionSummary,
        due_date: t.dueDate,
        assignee_id: t.assigneeId,
        source: t.source,
        direct_assignee_id: t.directAssigneeId,
        created_at: t.createdAt.toISOString(),
        claimed_at: t.claimedAt?.toISOString() || null,
        completed_at: t.completedAt?.toISOString() || null,
        assignee: t.assignee ? { name: t.assignee.name } : null,
        needs_help: t.needsHelp,
        help_requested_at: t.helpRequestedAt?.toISOString() || null,
        helper_count: t._count.collaborators,
        pending_reason: t.pendingReason,
        pending_tag: t.pendingTag,
        pended_at: t.pendedAt?.toISOString() || null,
        pended_from_status: t.pendedFromStatus,
        helpers: t.collaborators.map(c => ({
            id: c.user.id,
            name: c.user.name,
            image: c.user.image,
        })),
        archived_for_me: archivedSet.has(t.id),
    }));

    return NextResponse.json(data);
}
