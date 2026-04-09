import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { notifyLeaders } from '@/lib/notify-leaders';
import { sendTaskClaimedEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity-log';

// POST — Claim a task (any authenticated user)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if this is a reassignment
    let targetUserId = session.user.id;
    try {
        const body = await request.json();
        if (body.reassignTo) {
            targetUserId = body.reassignTo;
        }
    } catch {
        // No body or invalid JSON — default to self-claim
    }

    // Get target user's name
    const profile = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { name: true },
    });

    try {
        const task = await prisma.task.update({
            where: { id },
            data: {
                assigneeId: targetUserId,
                status: 'in-progress',
            },
        });

        // Notify leaders about task claim
        await notifyLeaders(
            'task_assigned',
            'Task Claimed',
            `${profile?.name || 'A member'} claimed task: "${task.title}"`,
            { task_id: id, task_token: task.taskToken }
        );

        // Log activity
        logActivity(targetUserId, 'task_claimed', `${profile?.name || 'A member'} claimed task "${task.title}"`, 'task', id);

        // Send email notification
        if (task.taskToken) {
            sendTaskClaimedEmail({
                taskToken: task.taskToken,
                title: task.title,
                requesterName: task.requesterName || 'Requester',
                claimedByName: profile?.name || 'A team member',
                urgency: task.urgency || 'P3',
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
