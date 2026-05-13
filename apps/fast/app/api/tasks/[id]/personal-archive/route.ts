import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// POST — Personal-archive a completed task for the current user. Doesn't change
// the task's global status; only hides it from the user's My Tasks / Team Inbox
// view. Per-user record, so any authenticated viewer (assignee, helper, or
// leader scrolling Team Inbox) can hide it from their own list.
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, status: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.status !== 'done' && task.status !== 'archived') {
        return NextResponse.json({ error: 'Only completed tasks can be archived' }, { status: 400 });
    }

    await prisma.userArchivedTask.upsert({
        where: { userId_taskId: { userId: session.user.id, taskId: id } },
        create: { userId: session.user.id, taskId: id },
        update: {},
    });

    return NextResponse.json({ success: true });
}

// DELETE — Restore a personally-archived task back to My Tasks.
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await prisma.userArchivedTask.deleteMany({
        where: { userId: session.user.id, taskId: id },
    });
    return NextResponse.json({ success: true });
}
