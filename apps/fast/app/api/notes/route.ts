import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Fetch user's notes
export async function GET() {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const notes = await prisma.note.findMany({
        where: { userId: session.user.id, archived: false },
        orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });

    return NextResponse.json(notes);
}

// POST — Create a new note
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, content, color } = await request.json();

    const note = await prisma.note.create({
        data: {
            title: title?.trim() || '',
            content: content?.trim() || '',
            color: color || 'default',
            userId: session.user.id,
        },
    });

    return NextResponse.json(note, { status: 201 });
}

// PUT — Update a note
export async function PUT(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, title, content, color, pinned, archived } = await request.json();
    if (!id) return NextResponse.json({ error: 'Note ID required' }, { status: 400 });

    // Verify ownership
    const existing = await prisma.note.findFirst({
        where: { id, userId: session.user.id },
    });
    if (!existing) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    const note = await prisma.note.update({
        where: { id },
        data: {
            ...(title !== undefined ? { title: title.trim() } : {}),
            ...(content !== undefined ? { content: content.trim() } : {}),
            ...(color !== undefined ? { color } : {}),
            ...(pinned !== undefined ? { pinned } : {}),
            ...(archived !== undefined ? { archived } : {}),
        },
    });

    return NextResponse.json(note);
}

// DELETE — Delete a note
export async function DELETE(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Note ID required' }, { status: 400 });

    await prisma.note.deleteMany({
        where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
}
