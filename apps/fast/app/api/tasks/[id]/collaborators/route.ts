import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';

// GET — List helper rows (pending + approved) for a task.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const rows = await prisma.taskCollaborator.findMany({
        where: { taskId: id },
        orderBy: { requestedAt: 'asc' },
        include: { user: { select: { id: true, name: true, image: true } } },
    });
    return NextResponse.json(rows.map(r => ({
        id: r.id,
        user_id: r.userId,
        name: r.user.name,
        image: r.user.image,
        role: r.role,
        status: r.status,
        requested_at: r.requestedAt.toISOString(),
        joined_at: r.joinedAt?.toISOString() || null,
    })));
}

// POST — A teammate requests to help. Creates a PENDING row and notifies the owner.
// Owner must approve via PATCH before the requester becomes an active helper.
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, title: true, assigneeId: true, needsHelp: true, taskToken: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (!task.needsHelp) {
        return NextResponse.json({ error: 'This task has not requested help' }, { status: 400 });
    }
    if (task.assigneeId === session.user.id) {
        return NextResponse.json({ error: 'You already own this task' }, { status: 400 });
    }

    const existing = await prisma.taskCollaborator.findUnique({
        where: { taskId_userId: { taskId: id, userId: session.user.id } },
    });
    if (existing) {
        return NextResponse.json({ success: true, alreadyRequested: true, status: existing.status });
    }

    await prisma.taskCollaborator.create({
        data: { taskId: id, userId: session.user.id, role: 'helper', status: 'pending' },
    });

    // Notify the owner — pending approval
    if (task.assigneeId) {
        const helper = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true },
        });
        await prisma.notification.create({
            data: {
                userId: task.assigneeId,
                type: 'task_help_request',
                title: 'Help offer pending',
                message: `${helper?.name || 'A teammate'} wants to help on "${task.title}" — approve or deny`,
                data: { task_id: id, task_token: task.taskToken },
            },
        });
    }

    logActivity(
        session.user.id,
        'task_help_requested_to_join',
        `Requested to help on "${task.title}"`,
        'task',
        id,
    );

    return NextResponse.json({ success: true, status: 'pending' });
}

// DELETE — Helper cancels their own request, or leaves an approved task.
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Capture the row BEFORE deleting so we can log the right event
    // (withdrawing a pending offer vs. leaving an approved task).
    const existing = await prisma.taskCollaborator.findUnique({
        where: { taskId_userId: { taskId: id, userId: session.user.id } },
    });

    await prisma.taskCollaborator.deleteMany({
        where: { taskId: id, userId: session.user.id },
    });

    if (existing) {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true },
        });
        const task = await prisma.task.findUnique({ where: { id }, select: { title: true } });
        const action = existing.status === 'approved' ? 'task_help_left' : 'task_help_offer_withdrawn';
        const desc = existing.status === 'approved'
            ? `${user?.name || 'User'} left the task "${task?.title ?? ''}"`
            : `${user?.name || 'User'} withdrew their offer to help on "${task?.title ?? ''}"`;
        logActivity(session.user.id, action, desc, 'task', id);
    }

    return NextResponse.json({ success: true });
}
