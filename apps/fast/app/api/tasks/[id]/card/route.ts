import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Lightweight task snapshot for channel-feed cards (Direct Assign +
// Routine Reminder). Returns just enough to render claim/claimed/done state
// without pulling the full task record. For routine cards (task.type set)
// also returns the checklist with each item's assignee so the TEAM-mode
// per-item Claim/Done buttons can render without an extra round-trip.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: {
            id: true,
            taskToken: true,
            title: true,
            description: true,
            urgency: true,
            status: true,
            source: true,
            type: true,
            routineTemplateId: true,
            referenceUrls: true,
            // Surface the channel + message linkage so the detail modal can
            // route its comment input to the matching thread on the bot's
            // ChannelMessage (single source of truth for routine convo).
            targetChannelId: true,
            channelMessageId: true,
            claimedAt: true,
            completedAt: true,
            assigneeId: true,
            assignee: { select: { id: true, name: true, image: true } },
            requesterName: true,
            dueDate: true,
            checklistItems: {
                orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    title: true,
                    isCompleted: true,
                    position: true,
                    assigneeId: true,
                    assignee: { select: { id: true, name: true, image: true } },
                    claimedAt: true,
                },
            },
        },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    return NextResponse.json({
        id: task.id,
        task_token: task.taskToken,
        title: task.title,
        description: task.description,
        urgency: task.urgency,
        status: task.status,
        source: task.source,
        type: task.type,
        routine_template_id: task.routineTemplateId,
        reference_urls: task.referenceUrls ?? [],
        channel_id: task.targetChannelId,
        channel_message_id: task.channelMessageId,
        claimed_at: task.claimedAt?.toISOString() || null,
        completed_at: task.completedAt?.toISOString() || null,
        assignee: task.assignee
            ? { id: task.assignee.id, name: task.assignee.name, image: task.assignee.image }
            : null,
        requester_name: task.requesterName,
        due_date: task.dueDate?.toISOString() || null,
        // Only return checklist for routine tasks — direct-assign/queue cards
        // never render one, so omitting it keeps the payload terse.
        checklist_items: task.type
            ? task.checklistItems.map((it) => ({
                  id: it.id,
                  title: it.title,
                  is_completed: it.isCompleted,
                  position: it.position,
                  assignee: it.assignee
                      ? { id: it.assignee.id, name: it.assignee.name, image: it.assignee.image }
                      : null,
                  claimed_at: it.claimedAt?.toISOString() || null,
              }))
            : null,
    });
}
