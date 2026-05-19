import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/team-inbox — direct-assigned tasks targeting the viewer's team.
//
// Visibility rules:
//   - Members & Leaders: only tasks where assignedTeamId === their teamId.
//   - Master (admin): can override with ?teamId=<id> to view another team's inbox.
//   - Tasks with no assignedTeamId stay hidden from the inbox by design — they
//     fall through to the existing Task Queue.
export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
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
            // Surface the routine template (when present) so the inbox can
            // split routine reminders into their own tab and render AHABOT
            // as the requester instead of the empty "Someone" fallback.
            routineTemplate: { select: { id: true, name: true } },
            // Pull just the viewer's archive marker — used to hide their own
            // personally-archived tasks from the Completed column.
            personalArchives: {
                where: { userId: session.user.id },
                select: { archivedAt: true },
                take: 1,
            },
            // Just the boolean — used to compute total/completed counts for the
            // card progress indicator without sending the full item payload.
            checklistItems: { select: { isCompleted: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    const visibleTasks = showArchived
        ? tasks
        : tasks.filter(t => t.personalArchives.length === 0);

    // Rolling auto-archive window for completed tasks. Routine reminders
    // (spawned by AHABOT, identified by routineTemplateId) age out after
    // 24h; standard tasks age out after 72h. The cutoff is computed once
    // per request against the server clock — no DB write, no schema
    // change. The client treats `autoArchivedByAge` rows identically to
    // personally-archived rows: hidden from the regular Kanban columns,
    // surfaced in the Archive view so Leaders can still review work.
    const now = Date.now();
    const ROUTINE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const STANDARD_WINDOW_MS = 72 * 60 * 60 * 1000;
    const isAutoArchivedByAge = (t: { status: string; completedAt: Date | null; routineTemplateId: string | null }): boolean => {
        if (t.status !== 'done') return false;
        if (!t.completedAt) return false;
        const ageMs = now - t.completedAt.getTime();
        const window = t.routineTemplateId ? ROUTINE_WINDOW_MS : STANDARD_WINDOW_MS;
        return ageMs >= window;
    };

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
        routineTemplate: t.routineTemplate,
        archivedByMe: t.personalArchives.length > 0,
        // Timestamp of the viewer's personal archive — null when the row
        // isn't archived for this user. The Task Inbox uses it to sort the
        // dedicated Archive view (Newest/Oldest/Last 30 days/All time).
        archivedAt: t.personalArchives[0]?.archivedAt?.toISOString() ?? null,
        // True when the task has aged past the auto-archive window for
        // its type (24h routine / 72h standard). Mutually independent of
        // archivedByMe — a task can be either, both, or neither. The
        // client filters BOTH out of the Kanban columns; the Archive
        // view shows the union so nothing reviewable disappears.
        autoArchivedByAge: isAutoArchivedByAge(t),
        pendingReason: t.pendingReason,
        pendingTag: t.pendingTag,
        pendedAt: t.pendedAt,
        pendedFromStatus: t.pendedFromStatus,
        needsHelp: t.needsHelp,
        checklist: {
            total: t.checklistItems.length,
            completed: t.checklistItems.filter(i => i.isCompleted).length,
        },
    }));

    return NextResponse.json({ tasks: data, teamId: targetTeamId });
}
