import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/team-inbox — direct-assigned tasks targeting the viewer's team.
//
// Visibility rules:
//   - Members & Leaders: only tasks where assignedTeamId === their teamId.
//   - Master (admin): can override with ?teamId=<id> to view another team's inbox.
//   - Tasks with no assignedTeamId stay hidden from the inbox by design — they
//     fall through to the existing Task Queue.
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, teamId: true },
    });
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const isMaster = me.role === 'admin';
    const url = new URL(request.url);
    const overrideTeamId = url.searchParams.get('teamId');
    // ?showArchived=1 — include tasks the viewer has personal-archived. Default
    // is to hide them so the Completed column doesn't fill up with old work.
    const showArchived = url.searchParams.get('showArchived') === '1';

    // Resolve which team's inbox to show.
    const targetTeamId = isMaster && overrideTeamId ? overrideTeamId : me.teamId;
    if (!targetTeamId) {
        // No team context — return an empty list rather than 400 so the page can
        // render an empty-state instead of an error.
        return NextResponse.json({ tasks: [], teamId: null });
    }

    // Inbox visibility — strict, ownership-based. assignedTeamId is set at
    // creation time from channel.teamId (single source of truth), so we don't
    // need to infer ownership from channel membership/visibility anymore.
    //   1. Explicit: task.assignedTeamId === targetTeamId.
    //   2. Claimer-derived: assignee belongs to targetTeam (covers tasks
    //      claimed before assignedTeamId was a thing).
    const tasks = await prisma.task.findMany({
        where: {
            source: 'direct_assign',
            OR: [
                { assignedTeamId: targetTeamId },
                { assignee: { teamId: targetTeamId } },
            ],
        },
        include: {
            assignee: { select: { id: true, name: true, image: true } },
            assignedTeam: { select: { id: true, name: true } },
            targetChannel: { select: { id: true, name: true } },
            // Pull just the viewer's archive marker — used to hide their own
            // personally-archived tasks from the Completed column.
            personalArchives: {
                where: { userId: session.user.id },
                select: { archivedAt: true },
                take: 1,
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const visibleTasks = showArchived
        ? tasks
        : tasks.filter(t => t.personalArchives.length === 0);

    const data = visibleTasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        urgency: t.urgency,
        status: t.status,
        attachments: t.attachments,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        claimedAt: t.claimedAt,
        completedAt: t.completedAt,
        overdueAcknowledgedAt: t.overdueAcknowledgedAt,
        taskToken: t.taskToken,
        requesterName: t.requesterName,
        requesterEmail: t.requesterEmail,
        requesterDivision: t.requesterDivision,
        targetChannelId: t.targetChannelId,
        channelMessageId: t.channelMessageId,
        targetChannel: t.targetChannel,
        assignee: t.assignee,
        assignedTeam: t.assignedTeam,
        archivedByMe: t.personalArchives.length > 0,
        pendingReason: t.pendingReason,
        pendingTag: t.pendingTag,
        pendedAt: t.pendedAt,
        pendedFromStatus: t.pendedFromStatus,
    }));

    return NextResponse.json({ tasks: data, teamId: targetTeamId });
}
