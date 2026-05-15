import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/tasks/posted-cards
// Every task the current user initiated, regardless of how — channel-posted
// Direct Assign cards (cross-division asks), leader-created direct
// assignments to specific members, request-form submissions filed under
// the user's own email, and DM-spawned tasks. Powers the /my-request
// "Command Center" view so initiators have one place to track everything
// they've asked for.
//
// Filter is intentionally permissive: requesterEmail = me.email AND
// source != 'queue'. The queue source is reserved for public form
// submissions where the requester is typically an external partner who
// happens to share an email with someone on the platform — those don't
// belong in a personal tracker. Channel-deleted cards still show up so
// initiators don't lose visibility on tasks whose source message was
// removed (the previous shape filtered them out via channelMessageId
// non-null; the frontend's "Channel Request" badge already degrades
// gracefully when target_channel_id is null).
export async function GET() {
    const session = await requireFastAuth();
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

    const tasks = await prisma.task.findMany({
        where: {
            requesterEmail: me.email,
            source: { not: 'queue' },
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
