import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/tasks/posted-cards
// All Direct Assign card tasks the current user posted into a channel,
// regardless of who eventually claimed/completed them. Used by /later → Posted
// Cards tab to give the poster a single tracking view across channels.
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, name: true },
    });
    if (!me?.email) {
        return NextResponse.json([], { status: 200 });
    }

    // Match by requester email — that's how direct-assign and direct-assign-from-message
    // both stamp posted cards, regardless of how the user signed in.
    // Hide cards whose channel or source message has been deleted: both FKs use
    // onDelete: SetNull, so a null on either field means the card is no longer
    // reachable from a channel and shouldn't appear in the tracker.
    const tasks = await prisma.task.findMany({
        where: {
            source: 'direct_assign',
            requesterEmail: me.email,
            channelMessageId: { not: null },
            targetChannelId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        include: {
            assignee: { select: { id: true, name: true, image: true } },
            targetChannel: { select: { id: true, name: true, isPrivate: true } },
        },
    });

    const data = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        urgency: t.urgency,
        priority: t.priority,
        source: t.source,
        task_token: t.taskToken,
        requester_name: t.requesterName,
        requester_division: t.requesterDivision,
        request_type: t.requestType,
        due_date: t.dueDate?.toISOString() || null,
        created_at: t.createdAt.toISOString(),
        claimed_at: t.claimedAt?.toISOString() || null,
        completed_at: t.completedAt?.toISOString() || null,
        // Claimer + channel — what the tracking view actually needs.
        claimer_name: t.assignee?.name || null,
        claimer_image: t.assignee?.image || null,
        target_channel_id: t.targetChannelId,
        channel_message_id: t.channelMessageId,
        channel_name: t.targetChannel?.name || null,
        channel_is_private: t.targetChannel?.isPrivate ?? null,
    }));

    return NextResponse.json(data);
}
