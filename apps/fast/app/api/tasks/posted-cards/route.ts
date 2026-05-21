import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/tasks/posted-cards
// Every task the current user initiated, regardless of how — channel-posted
// Direct Assign cards (cross-division asks) AND leader-created direct
// assignments to specific members. Powers the /my-request "Command
// Center" view so initiators have one place to track everything they've
// asked of someone else.
//
// Surface rule: a row belongs to "My Request" iff the caller is the
// requester AND the task is something they asked *of another person*
// (not a personal todo). Two populations satisfy that:
//
//   (a) Channel posts — targetChannelId IS NOT NULL. The original PR
//       #55 "canonical channel-only" shape. SetNull cascades on
//       channel delete leave target_channel_id intact, so rows whose
//       channel has since been deleted still qualify.
//
//   (b) Direct Assignments to another teammate — targetChannelId IS
//       NULL, source ∈ {'direct_request', 'direct_assign'}, and
//       assigneeId ≠ requester. The source predicate filters out
//       'queue' (form submissions land in the queue page) and the
//       legacy DM-spawned flows that have their own surface; the
//       assigneeId guard excludes self-assigned personal cards
//       (Create Card → me), which live in My Tasks → Direct Tasks.
//
// History: PR #23 broadened the filter to cover both populations,
// PR #56 narrowed it back to channel-only ("canonical channel-aware
// rules") but did not revert the MyRequestView UI changes — leaving
// the badge palette and header copy advertising both populations
// while the backend silently dropped Direct Assignments. This route
// re-broadens to match the UI contract; if a future spec wants to
// channel-only-ify "My Request" again, that's a UI change too.
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
            OR: [
                // (a) Channel posts — any task the user posted into a
                // team channel via Direct Assign. SetNull-cascaded rows
                // (deleted channels) still match because the column is
                // intact even after the relation FK clears.
                { targetChannelId: { not: null } },
                // (b) Direct Assignments to another teammate. Self-
                // assigned personals (assigneeId == me) and queue/form
                // submissions (source == 'queue') drop out so the
                // command-center scope stays "things I asked of
                // someone else".
                {
                    targetChannelId: null,
                    source: { in: ['direct_request', 'direct_assign'] },
                    NOT: { assigneeId: session.user.id },
                },
            ],
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
