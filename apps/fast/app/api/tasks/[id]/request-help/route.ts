import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';

// POST — Owner flags their claimed task as needing help; broadcasts to teammates.
// DELETE — Owner cancels the help request (helpers already joined are kept).
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, title: true, assigneeId: true, taskToken: true, needsHelp: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.assigneeId !== session.user.id) {
        return NextResponse.json({ error: 'Only the assignee can request help' }, { status: 403 });
    }
    if (task.needsHelp) {
        return NextResponse.json({ success: true, alreadyFlagged: true });
    }

    await prisma.task.update({
        where: { id },
        data: { needsHelp: true, helpRequestedAt: new Date() },
    });

    // Fan-out notifications to teammates (same team, not the owner)
    const owner = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, teamId: true },
    });
    if (owner?.teamId) {
        const teammates = await prisma.user.findMany({
            where: { teamId: owner.teamId, id: { not: session.user.id }, accountStatus: 'active' },
            select: { id: true },
        });
        if (teammates.length > 0) {
            await prisma.notification.createMany({
                data: teammates.map(t => ({
                    userId: t.id,
                    type: 'task_help_requested',
                    title: 'Teammate needs help',
                    message: `${owner.name} asked for help on "${task.title}"`,
                    data: { task_id: id, task_token: task.taskToken },
                })),
            });
        }
    }

    logActivity(
        session.user.id,
        'task_help_requested',
        `${owner?.name || 'User'} requested help on "${task.title}"`,
        'task',
        id,
    );

    return NextResponse.json({ success: true });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { assigneeId: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.assigneeId !== session.user.id) {
        return NextResponse.json({ error: 'Only the assignee can cancel the help request' }, { status: 403 });
    }

    await prisma.task.update({
        where: { id },
        data: { needsHelp: false, helpRequestedAt: null },
    });

    const owner = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
    });
    const taskForLog = await prisma.task.findUnique({ where: { id }, select: { title: true } });
    logActivity(
        session.user.id,
        'task_help_request_cancelled',
        `${owner?.name || 'Assignee'} cancelled the help request on "${taskForLog?.title ?? ''}"`,
        'task',
        id,
    );

    return NextResponse.json({ success: true });
}
