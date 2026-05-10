import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// PATCH — toggle isCompleted and/or rename the title.
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
        select: { id: true, taskId: true },
    });
    if (!item || item.taskId !== id) {
        return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
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
