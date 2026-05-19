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
// PR #55 canonical rule for "My Request":
//
//     requesterEmail === me.email AND targetChannelId IS NOT NULL
//
// "My Request" is the channel-initiated requests command center —
// every task the caller posted into a team channel (whether the
// channel itself has since been deleted is fine; the
// target_channel_id column is left intact under the SetNull cascade,
// only the relation FK clears, so the row still satisfies the IS NOT
// NULL predicate here). Channel-less tasks (Create Card personals,
// queue form submissions, leader-direct-requests routed via DM)
// belong to their own surfaces.
//
// The PR #53/#54 NOT-AND escape hatch that excluded self-assigned
// personal cards is no longer necessary: those cards never had a
// targetChannelId in the first place, so the channel predicate
// already drops them. Cleaner query, same observable set, no risk of
// the predicate silently dropping a legitimate row.
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
            // Channel-initiated only — the canonical PR #55 rule. The
            // implicit corollaries: Create Card personals (no channel),
            // queue form submissions (no channel), and leader-direct
            // requests routed via DM (no channel) all drop out. Each of
            // those populations has its own home (Direct Tasks, the
            // queue page, DMs respectively).
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
