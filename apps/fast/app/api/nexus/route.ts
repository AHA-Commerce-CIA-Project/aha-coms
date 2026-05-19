import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Fetch all tasks for Nexus board (requires auth)
export async function GET() {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Resolve the viewer so we can scope the queue by team. Master/admin sees
    // every team's queue (their dashboard role); members & leaders see only
    // their own team's queue plus the open (unclaimed) pool.
    const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, teamId: true },
    });
    const isMaster = me?.role === 'admin';

    const personalArchived = await prisma.userArchivedTask.findMany({
        where: { userId: session.user.id },
        select: { taskId: true },
    });
    const archivedForMeSet = new Set(personalArchived.map(p => p.taskId));

    // Strict team-scoped visibility — same model as Team Inbox.
    //   - assignee.teamId == me.teamId → already claimed by my team.
    //   - assignedTeamId == me.teamId  → explicitly routed to my team.
    //   - Leaders also see "orphan" tasks (no assignee + no team) so they can
    //     triage them via the Route-to-Team action; members never see orphans.
    const isLeader = me?.role === 'leader';
    const teamScope = (!isMaster && me?.teamId)
        ? {
            OR: [
                { assignee: { teamId: me.teamId } },
                { assignedTeamId: me.teamId },
                ...(isLeader ? [{ AND: [{ assigneeId: null }, { assignedTeamId: null }] }] : []),
            ],
        }
        : {};

    const tasks = await prisma.task.findMany({
        where: {
            // Two-branch surface:
            //   1. Regular Open Queue items — not direct_request/direct_assign,
            //      scoped to my team (or broad for master).
            //   2. Help-flagged tasks of ANY source — broadcast company-wide so
            //      direct_request/direct_assign recipients who flag needs_help
            //      can be discovered by helpers from other teams. Limited to
            //      active statuses so done/archived help requests don't linger.
            OR: [
                {
                    source: { notIn: ['direct_request', 'direct_assign'] },
                    ...teamScope,
                },
                {
                    needsHelp: true,
                    status: { notIn: ['done', 'archived'] },
                },
            ],
        },
        include: {
            assignee: {
                select: { name: true },
            },
            assignedTeam: {
                select: { id: true, name: true },
            },
            completedByUser: {
                select: { name: true },
            },
            reviews: {
                select: { id: true, reviewerType: true, rating: true, comment: true, reviewerName: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            },
            _count: { select: { collaborators: { where: { status: 'approved' } } } },
            collaborators: {
                where: { status: 'approved' },
                include: { user: { select: { id: true, name: true, image: true } } },
                orderBy: { joinedAt: 'asc' },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Map to the old format expected by the frontend
    const data = tasks.map(t => ({
        ...t,
        // Convert camelCase to snake_case for frontend compatibility
        requester_name: t.requesterName,
        requester_email: t.requesterEmail,
        requester_division: t.requesterDivision,
        custom_fields: t.customFields,
        difficulty_score: t.difficultyScore,
        feedback_notes: t.feedbackNotes,
        request_type: t.requestType,
        attachment_link: t.attachmentLink,
        image_url: t.attachmentLink,
        impact_description: t.impactDescription,
        related_project_name: t.relatedProjectName,
        meeting_date_range: t.meetingDateRange,
        meeting_duration: t.meetingDuration,
        meeting_purpose: t.meetingPurpose,
        task_token: t.taskToken,
        completed_by: t.completedByUser?.name || t.completedBy || null,
        completed_by_id: t.completedBy || null,
        actual_time_spent: t.actualTimeSpent,
        time_unit: t.timeUnit,
        resolution_summary: t.resolutionSummary,
        due_date: t.dueDate,
        project_id: t.projectId,
        assignee_id: t.assigneeId,
        assigned_team_id: t.assignedTeamId,
        assigned_team: t.assignedTeam ? { id: t.assignedTeam.id, name: t.assignedTeam.name } : null,
        source: t.source,
        // Surface target_channel_id + routine_template_id under their
        // snake_case alias so /tasks page can apply the PR #55
        // canonical client filter (Direct Tasks vs Open Queue) without
        // a second round-trip. The spread above already includes the
        // camelCase versions from Prisma; these explicit aliases keep
        // the response shape consistent with sibling endpoints
        // (my-direct-requests, etc.) that frontend code reads.
        target_channel_id: t.targetChannelId,
        routine_template_id: t.routineTemplateId,
        direct_assignee_id: t.directAssigneeId,
        is_recurring: t.isRecurring,
        recurrence_type: t.recurrenceType,
        created_at: t.createdAt.toISOString(),
        claimed_at: t.claimedAt?.toISOString() || null,
        completed_at: t.completedAt?.toISOString() || null,
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
        archived_for_me: archivedForMeSet.has(t.id),
        assignee: t.assignee ? { name: t.assignee.name } : null,
        reviews: t.reviews.map(r => ({
            id: r.id,
            reviewer_type: r.reviewerType,
            rating: r.rating,
            comment: r.comment,
            reviewer_name: r.reviewerName,
            created_at: r.createdAt.toISOString(),
        })),
    }));

    return NextResponse.json(data);
}
