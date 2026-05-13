import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';

// PATCH /api/tasks/[id]/route-team — Route an orphan task to a team.
// Used by leaders/admins to triage tasks that came in without a team owner
// (e.g. older queue tasks created before the request form had a team picker).
//
// Body: { teamId: string | null }   // null clears the routing
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });
    if (me?.role !== 'leader' && me?.role !== 'admin') {
        return NextResponse.json({ error: 'Leader or admin only' }, { status: 403 });
    }

    let body: { teamId?: string | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { id } = await params;
    const teamId = body.teamId ?? null;

    // If a team is provided, make sure it actually exists — otherwise we'd
    // silently strand the task with a dangling FK reference.
    if (teamId) {
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true, name: true },
        });
        if (!team) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }
    }

    const task = await prisma.task.update({
        where: { id },
        data: { assignedTeamId: teamId },
        select: {
            id: true,
            title: true,
            assignedTeamId: true,
            assignedTeam: { select: { id: true, name: true } },
        },
    });

    logActivity(
        session.user.id,
        'task_updated',
        teamId
            ? `${session.user.name} routed task "${task.title}" to ${task.assignedTeam?.name}`
            : `${session.user.name} cleared team routing on "${task.title}"`,
        'task',
        id,
    );

    return NextResponse.json({ success: true, task });
}
