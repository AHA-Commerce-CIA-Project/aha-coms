import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { notifyLeaders } from '@/lib/notify-leaders';
import { sendTaskClaimedEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity-log';

// POST — Claim a task (any authenticated user)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if this is a reassignment
    // Authorization rules:
    //   - Leaders/admins: can reassign any task
    //   - Members: can reassign any task for which they are the current assignee
    //     (so queue-claimed AND direct-request tasks they own). Helpers/non-assignees cannot.
    let targetUserId = session.user.id;
    let isLeaderAssign = false;
    try {
        const body = await request.json();
        if (body.reassignTo) {
            const caller = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { role: true },
            });
            const isLeaderRole = caller?.role === 'leader' || caller?.role === 'admin';

            if (!isLeaderRole) {
                const existing = await prisma.task.findUnique({
                    where: { id },
                    select: { assigneeId: true },
                });
                if (existing?.assigneeId !== session.user.id) {
                    return NextResponse.json(
                        { error: 'You can only reassign tasks that are currently assigned to you.' },
                        { status: 403 },
                    );
                }
            }

            targetUserId = body.reassignTo;
            isLeaderAssign = true;
        }
    } catch {
        // No body or invalid JSON — default to self-claim
    }

    // Get target user's name + status (and teamId so we can backfill direct-assign ownership)
    const profile = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { name: true, accountStatus: true, teamId: true },
    });
    if (!profile) {
        return NextResponse.json({ error: 'Assignee not found' }, { status: 404 });
    }
    if (isLeaderAssign && profile.accountStatus !== 'active') {
        return NextResponse.json({ error: 'Cannot assign to an inactive account' }, { status: 400 });
    }

    // Backfill team ownership for direct-assigned tasks. If this task was posted
    // into a channel that didn't have a single allowedTeamId at submit time,
    // assignedTeamId can be null — fix it now using the claimer's team so the
    // task lands in the right Team Inbox going forward.
    const existing = await prisma.task.findUnique({
        where: { id },
        select: { source: true, assignedTeamId: true, type: true },
    });

    // TEAM-type routine tasks expose only the per-item claim endpoint — the
    // whole-task claim isn't valid for them. Reject early so a stale client
    // can't accidentally seize the whole card.
    if (existing?.type === 'TEAM') {
        return NextResponse.json(
            { error: 'TEAM tasks are claimed per checklist item, not as a whole.' },
            { status: 400 },
        );
    }

    const shouldBackfillTeam =
        existing?.source === 'direct_assign' &&
        !existing?.assignedTeamId &&
        !!profile.teamId;

    try {
        const task = await prisma.task.update({
            where: { id },
            data: {
                assigneeId: targetUserId,
                status: 'in-progress',
                claimedAt: new Date(),
                ...(shouldBackfillTeam ? { assignedTeamId: profile.teamId } : {}),
            },
        });

        // Notify leaders about task claim/assignment
        await notifyLeaders(
            'task_assigned',
            isLeaderAssign ? 'Task Assigned' : 'Task Claimed',
            isLeaderAssign
                ? `${profile.name} was assigned task: "${task.title}"`
                : `${profile.name} claimed task: "${task.title}"`,
            { task_id: id, task_token: task.taskToken }
        );

        // If leader assigned to someone else, also notify the assignee directly
        if (isLeaderAssign && targetUserId !== session.user.id) {
            await prisma.notification.create({
                data: {
                    userId: targetUserId,
                    type: 'task_assigned',
                    title: 'You have been assigned a task',
                    message: `${session.user.name} assigned you: "${task.title}"`,
                    data: { task_id: id, task_token: task.taskToken },
                },
            });
        }

        // Log activity
        logActivity(
            isLeaderAssign ? session.user.id : targetUserId,
            isLeaderAssign ? 'task_assigned' : 'task_claimed',
            isLeaderAssign
                ? `${session.user.name} assigned "${task.title}" to ${profile.name}`
                : `${profile.name} claimed task "${task.title}"`,
            'task',
            id,
        );

        // Send email notification to requester and admin
        if (task.taskToken) {
            sendTaskClaimedEmail({
                taskToken: task.taskToken,
                title: task.title,
                requesterName: task.requesterName || 'Requester',
                claimedByName: profile?.name || 'A team member',
                urgency: task.urgency || 'P3',
                requesterEmail: task.requesterEmail || undefined,
            }).catch(() => {});
        }

        return NextResponse.json({
            success: true,
            assignee_name: profile?.name || 'Unknown',
            task,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
