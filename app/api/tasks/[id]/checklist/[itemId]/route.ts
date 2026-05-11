import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// PATCH — toggle isCompleted and/or rename the title.
//
// For TEAM-type routine tasks the per-item assigneeId is the access boundary:
// only the user who claimed an item can mark it done. INDIVIDUAL/legacy tasks
// keep the old "anyone with task access can edit" behavior so existing
// queue/direct-assign flows aren't disturbed.
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; itemId: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id, itemId } = await params;
    let body: { title?: string; isCompleted?: boolean };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const item = await prisma.checklistItem.findUnique({
        where: { id: itemId },
        select: {
            id: true,
            taskId: true,
            assigneeId: true,
            task: { select: { id: true, type: true, assigneeId: true } },
        },
    });
    if (!item || item.taskId !== id) {
        return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
    }

    // Per-type permission gate.
    //   TEAM:       only the item's claimer (or leader) can mutate it.
    //   INDIVIDUAL: once the whole task is claimed, locks to that assignee.
    //   non-routine (item.task.type == null): unchanged — anyone with task
    //                                         access can edit, matching the
    //                                         legacy queue/direct-assign flow.
    if (item.task.type === 'TEAM' || item.task.type === 'INDIVIDUAL') {
        const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        const isLeader = me?.role === 'leader' || me?.role === 'admin';
        if (!isLeader) {
            if (item.task.type === 'TEAM') {
                if (item.assigneeId !== session.user.id) {
                    return NextResponse.json(
                        { error: 'Claim this item first before updating it.' },
                        { status: 403 },
                    );
                }
            } else if (item.task.assigneeId && item.task.assigneeId !== session.user.id) {
                return NextResponse.json(
                    { error: 'This task is claimed by another member.' },
                    { status: 403 },
                );
            }
        }
    }

    const data: { title?: string; isCompleted?: boolean } = {};
    if (typeof body.title === 'string') {
        const trimmed = body.title.trim();
        if (!trimmed) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
        if (trimmed.length > 200) return NextResponse.json({ error: 'Title is too long (max 200 chars)' }, { status: 400 });
        data.title = trimmed;
    }
    if (typeof body.isCompleted === 'boolean') data.isCompleted = body.isCompleted;
    if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.checklistItem.update({ where: { id: itemId }, data });

    // Auto-complete the parent task when every checklist item is done. Only
    // for routine tasks (type set) — we don't want a partial checklist on a
    // queue task to silently close it.
    if (data.isCompleted === true && item.task.type) {
        const remaining = await prisma.checklistItem.count({
            where: { taskId: id, isCompleted: false },
        });
        if (remaining === 0) {
            await prisma.task.update({
                where: { id },
                data: { status: 'done', completedAt: new Date() },
            });
        }
    } else if (data.isCompleted === false && item.task.type) {
        // Un-checking an item on an already-completed routine task reopens it.
        await prisma.task.updateMany({
            where: { id, status: 'done' },
            data: { status: 'in-progress', completedAt: null },
        });
    }

    return NextResponse.json(updated);
}

// DELETE — remove the item entirely. No soft-delete; checklist items are
// cheap and users expect "x" to actually remove the row.
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; itemId: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id, itemId } = await params;
    const item = await prisma.checklistItem.findUnique({
        where: { id: itemId },
        select: { id: true, taskId: true },
    });
    if (!item || item.taskId !== id) {
        return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
    }
    await prisma.checklistItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
}
