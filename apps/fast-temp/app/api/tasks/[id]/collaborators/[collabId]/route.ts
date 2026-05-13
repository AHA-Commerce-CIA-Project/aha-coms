import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-log';

// PATCH — Owner approves or denies a help request.
// Body: { action: 'approve' | 'deny' }
// On approve: row.status → 'approved', joinedAt = now(). On deny: row is deleted.
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collabId: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, collabId } = await params;
    const { action } = await request.json();
    if (action !== 'approve' && action !== 'deny') {
        return NextResponse.json({ error: 'action must be "approve" or "deny"' }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
        where: { id },
        select: { assigneeId: true, title: true, taskToken: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.assigneeId !== session.user.id) {
        return NextResponse.json({ error: 'Only the task assignee can approve or deny help requests' }, { status: 403 });
    }

    const row = await prisma.taskCollaborator.findUnique({
        where: { id: collabId },
        include: { user: { select: { id: true, name: true } } },
    });
    if (!row || row.taskId !== id) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (action === 'approve') {
        await prisma.taskCollaborator.update({
            where: { id: collabId },
            data: { status: 'approved', joinedAt: new Date() },
        });
        await prisma.notification.create({
            data: {
                userId: row.userId,
                type: 'task_help_approved',
                title: 'Your help was accepted',
                message: `You are now helping on "${task.title}"`,
                data: { task_id: id, task_token: task.taskToken },
            },
        });
        logActivity(
            session.user.id,
            'task_help_approved',
            `Approved ${row.user.name} to help on "${task.title}"`,
            'task',
            id,
        );
        return NextResponse.json({ success: true, status: 'approved' });
    }

    // Deny → delete the row.
    await prisma.taskCollaborator.delete({ where: { id: collabId } });
    await prisma.notification.create({
        data: {
            userId: row.userId,
            type: 'task_help_denied',
            title: 'Help request declined',
            message: `Your offer to help on "${task.title}" was declined`,
            data: { task_id: id, task_token: task.taskToken },
        },
    });
    logActivity(
        session.user.id,
        'task_help_denied',
        `Declined ${row.user.name}'s offer to help on "${task.title}"`,
        'task',
        id,
    );
    return NextResponse.json({ success: true, status: 'denied' });
}
