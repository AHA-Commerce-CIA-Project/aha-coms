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

    const personalArchived = await prisma.userArchivedTask.findMany({
        where: { userId: session.user.id },
        select: { taskId: true },
    });
    const archivedForMeSet = new Set(personalArchived.map(p => p.taskId));

    const tasks = await prisma.task.findMany({
        where: { source: 'direct_request' },
        include: {
            assignee: { select: { name: true } },
            directAssignee: { select: { name: true } },
            assignedTeam: { select: { id: true, name: true } },
            completedByUser: { select: { name: true } },
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
        ...t,
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
        direct_assignee_id: t.directAssigneeId,
        is_recurring: t.isRecurring,
        recurrence_type: t.recurrenceType,
        created_at: t.createdAt.toISOString(),
        claimed_at: t.claimedAt?.toISOString() || null,
        completed_at: t.completedAt?.toISOString() || null,
        response_deadline: t.responseDeadline?.toISOString() || null,
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
        assignee_name: t.assignee?.name || null,
        direct_assignee_name: t.directAssignee?.name || null,
        reviews: t.reviews.map(r => ({
            id: r.id,
            reviewer_type: r.reviewerType,
            rating: r.rating,
            comment: r.comment,
            reviewer_name: r.reviewerName,
            created_at: r.createdAt.toISOString(),
        })),
        delegations: t.delegations.map(d => ({
            from: d.fromUser.name,
            to: d.toUser.name,
            reason: d.reason,
            date: d.createdAt.toISOString(),
        })),
    }));

    return NextResponse.json(data);
}
