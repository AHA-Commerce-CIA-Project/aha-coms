import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Direct Tasks for the current user. Powers the "Direct Tasks"
// tab on /tasks. Canonical rule, restated 2026-05-19 (second pass):
//
//     assigneeId === me
//   AND status IN [active whitelist]
//   AND source IN ('direct_request', 'direct_assign')
//
// Earlier today we tried a channel-based split (targetChannelId IS
// NULL OR source = 'direct_assign'), but empirically the
// direct_request rows that the prior brief wanted in "Open Queue"
// (claimed Partner Requests like "Update MBR SCHO-M" / "[SOFT-M]")
// all carry targetChannelId = NULL — so the channel-null branch
// over-included them in Direct Tasks and Open Queue rendered empty.
// The discriminator that actually maps to the user's mental model
// is source, not channel: leader-assigned direct requests and
// personal cards are explicitly "direct"; everything else (queue
// form submissions, dm-spawned, routines) is "claimed public" and
// lands in Open Queue via /api/nexus + the client-side filter at
// /tasks.
//
// Routine task instances (routineTemplateId IS NOT NULL) carry
// source='queue' so they don't land here — they flow through
// /api/nexus and get bucketed to Direct Tasks via a routine-aware
// branch in the client-side filter. That keeps this endpoint focused
// on its primary load (leader-direct + personal-card rows) and lets
// the routine carve-out live next to the rest of the tab-split logic
// where it's easier to evolve.
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
            // Source-based partition — the only schema field that
            // reliably distinguishes "directly assigned to me" from
            // "claimed off a public queue". Empirically the channel
            // column is null on both populations so it can't be the
            // discriminator.
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
