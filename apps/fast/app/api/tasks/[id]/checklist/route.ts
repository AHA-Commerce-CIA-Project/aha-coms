import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — list checklist items for a task. Open to any authed user; the task
// itself is the access boundary (anyone who can see the task can see / edit
// its checklist, matching how comments work).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const items = await prisma.checklistItem.findMany({
        where: { taskId: id },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json(items);
}

// POST — append a new item. Position is set to (max position + 1) so order is
// preserved without the client needing to send it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    let body: { title?: string };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const title = (body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: 'Title is too long (max 200 chars)' }, { status: 400 });

    const task = await prisma.task.findUnique({
        where: { id },
        select: { id: true, type: true },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const last = await prisma.checklistItem.findFirst({
        where: { taskId: id },
        orderBy: { position: 'desc' },
        select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;

    // TEAM-mode auto-claim: the user who appends an item takes ownership of
    // it immediately. Matches the mental model that "I added it because I'm
    // going to do it" and avoids the clunky add → claim → edit dance. The
    // creator can release the claim from the card if it wasn't intentional.
    // INDIVIDUAL/legacy: leave assigneeId null — items are owned via the
    // whole-task assignee, not per-item.
    const autoClaim = task.type === 'TEAM';

    const created = await prisma.checklistItem.create({
        data: {
            taskId: id,
            title,
            position,
            ...(autoClaim
                ? { assigneeId: session.user.id, claimedAt: new Date() }
                : {}),
        },
        include: autoClaim
            ? { assignee: { select: { id: true, name: true, image: true } } }
            : undefined,
    });

    return NextResponse.json(created, { status: 201 });
}
