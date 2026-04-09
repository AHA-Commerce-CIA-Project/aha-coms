import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch all tasks for Nexus board (requires auth)
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tasks = await prisma.task.findMany({
        include: {
            assignee: {
                select: { name: true },
            },
            completedByUser: {
                select: { name: true },
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
        impact_description: t.impactDescription,
        related_project_name: t.relatedProjectName,
        meeting_date_range: t.meetingDateRange,
        meeting_duration: t.meetingDuration,
        meeting_purpose: t.meetingPurpose,
        task_token: t.taskToken,
        completed_by: t.completedByUser?.name || t.completedBy || null,
        actual_time_spent: t.actualTimeSpent,
        time_unit: t.timeUnit,
        resolution_summary: t.resolutionSummary,
        due_date: t.dueDate,
        project_id: t.projectId,
        assignee_id: t.assigneeId,
        is_recurring: t.isRecurring,
        recurrence_type: t.recurrenceType,
        created_at: t.createdAt.toISOString(),
        completed_at: t.completedAt?.toISOString() || null,
        assignee: t.assignee ? { name: t.assignee.name } : null,
    }));

    return NextResponse.json(data);
}
