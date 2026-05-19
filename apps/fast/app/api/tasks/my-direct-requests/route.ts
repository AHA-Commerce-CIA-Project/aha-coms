import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Direct Tasks for the current user. Powers the "Direct Tasks"
// tab on /tasks. The canonical rule (PR #55) is:
//
//     assigneeId === me
//   AND status IN [active whitelist]
//   AND (targetChannelId IS NULL OR source = 'direct_assign')
//
// expressed as the union of three populations:
//
//   • Leader-assigned direct requests — source='direct_request' and
//     always channel-less per /api/tasks's writer shape; picked up via
//     the channel-null branch.
//   • Self-created personal cards (Create Card flow) — source=
//     'direct_assign', channel-less; picked up by either branch.
//   • Channel-posted Direct Assign cards the caller has claimed —
//     source='direct_assign' with a non-null targetChannelId; picked
//     up via the direct-assign branch.
//
// Queue / form / DM / routine-spawned tasks are explicitly out: those
// surfaces have their own tabs (Open Queue, routine inboxes), and
// historically a few of them carried no targetChannelId which would
// have over-included them under a pure "channel-null" predicate.
//
// History note: PR #53 layered on `requesterEmail = session.user.email`
// to keep leader-posted direct_assigns out, but the session-cached
// email and the freshly-read DB requesterEmail could diverge by case,
// dropping freshly created cards. PR #54 removed it. PR #55 restates
// the rule in the user-stated canonical form (channel-null OR
// direct-assign) so the predicate aligns 1:1 with the brief.
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
            // Canonical rule from the PR #55 brief — "channelId IS NULL
            // OR isDirectAssign". Restated against the schema: leave
            // every channel-less direct row in (direct_request always
            // qualifies; self-created direct_assign personal cards
            // qualify here too) and additionally pull in channel-
            // posted Direct Assign cards by their source. Without this
            // OR, channel-claimed direct_assigns where the caller is
            // the assignee would slip through but historical channel-
            // less direct_requests would too — so it doubles as a
            // belt-and-braces guard.
            OR: [
                { targetChannelId: null },
                { source: 'direct_assign' },
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
        // Surface targetChannelId + routineTemplateId so the /tasks
        // page can apply the PR #55 canonical client filter without a
        // second round-trip.
        target_channel_id: t.targetChannelId,
        routine_template_id: t.routineTemplateId,
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
