import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Direct Tasks for the current user. Powers the "Direct Tasks" tab
// on /tasks (was "Direct Requests" pre-PR #53). Returns every task the
// caller currently owns as assignee whose source is one of the two
// "direct" flavours:
//
//   • direct_request  — leader-assigned tasks (the original shape;
//                        existing test in route.test.ts covers the
//                        status whitelist).
//   • direct_assign   — channel-posted Direct Assign cards that the
//                        caller has claimed, plus self-assigned
//                        personal cards created via /api/tasks/self.
//
// PR #53 layered on an additional `requesterEmail = session.user.email`
// predicate to keep leader-posted direct_assigns where someone else is
// the requester out of the bucket. That predicate turned out to be
// fragile: the session cache holds the cookie-resolved email, and any
// case / whitespace divergence from the row's stored requesterEmail
// drops the row silently — exactly the "new personal cards don't show
// up" symptom this PR is fixing. Dropping the email check is also a
// better semantic fit for the renamed tab: "Direct Tasks" should mean
// every task I personally own as the assignee, regardless of who
// originally requested it.
//
// Status whitelist matches the existing test assertion; on-hold
// (status='pending') stays visible per the 2026-05-13 fix documented
// in apps/fast/app/api/tasks/my-direct-requests/route.test.ts.
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
            // direct_request + direct_assign cover every task the caller
            // owns under the "Direct" umbrella. Other sources (queue,
            // form, routine) live in their own surfaces and shouldn't
            // bleed into Direct Tasks.
            source: { in: ['direct_request', 'direct_assign'] },
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
