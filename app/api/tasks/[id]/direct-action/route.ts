import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-log';
import { directRequestActionSchema, validate } from '@/lib/validations';

// POST — Approve, decline, or delegate a direct request
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = validate(directRequestActionSchema, body);
    if (!parsed.success) return parsed.response;

    const { action, delegateToUserId, delegateReason } = parsed.data;

    // Fetch the task
    const task = await prisma.task.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            status: true,
            directAssigneeId: true,
            requesterName: true,
            taskToken: true,
        },
    });

    if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify the current user is the direct assignee or task is pending approval
    if (task.directAssigneeId !== session.user.id && task.status !== 'pending_approval') {
        return NextResponse.json({ error: 'Not authorized to perform this action' }, { status: 403 });
    }

    const userName = session.user.name || 'A member';

    if (action === 'approve') {
        await prisma.task.update({
            where: { id },
            data: {
                status: 'in-progress',
                assigneeId: session.user.id,
            },
        });

        // Notify the requester if they have an account
        if (task.requesterName) {
            const requesterUser = await prisma.user.findFirst({
                where: { name: task.requesterName },
                select: { id: true },
            });
            if (requesterUser) {
                await prisma.notification.create({
                    data: {
                        userId: requesterUser.id,
                        type: 'direct_request',
                        title: 'Direct Request Approved',
                        message: `${userName} approved your direct request: "${task.title}"`,
                        data: { task_id: task.id, task_token: task.taskToken },
                    },
                });
            }
        }

        logActivity(session.user.id, 'direct_request_approved', `${userName} approved direct request "${task.title}"`, 'task', id);

        return NextResponse.json({ success: true, action: 'approved' });
    }

    if (action === 'decline') {
        await prisma.task.update({
            where: { id },
            data: {
                status: 'todo',
                directAssigneeId: null,
                source: 'queue',
            },
        });

        logActivity(session.user.id, 'direct_request_declined', `${userName} declined direct request "${task.title}"`, 'task', id);

        return NextResponse.json({ success: true, action: 'declined' });
    }

    if (action === 'delegate') {
        if (!delegateToUserId) {
            return NextResponse.json({ error: 'delegateToUserId is required for delegate action' }, { status: 400 });
        }

        // Update the task's direct assignee
        await prisma.task.update({
            where: { id },
            data: {
                directAssigneeId: delegateToUserId,
            },
        });

        // Create delegation record
        await prisma.taskDelegation.create({
            data: {
                taskId: id,
                fromUserId: session.user.id,
                toUserId: delegateToUserId,
                reason: delegateReason || null,
            },
        });

        // Get delegate user name for notification
        const delegateUser = await prisma.user.findUnique({
            where: { id: delegateToUserId },
            select: { name: true },
        });

        // Notify the new assignee
        await prisma.notification.create({
            data: {
                userId: delegateToUserId,
                type: 'direct_request',
                title: 'Direct Request Delegated to You',
                message: `${userName} delegated a direct request to you: "${task.title}"`,
                data: { task_id: task.id, task_token: task.taskToken },
            },
        });

        logActivity(session.user.id, 'direct_request_delegated', `${userName} delegated direct request "${task.title}" to ${delegateUser?.name || 'another member'}`, 'task', id);

        return NextResponse.json({ success: true, action: 'delegated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
