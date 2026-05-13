import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { sanitizeRichText } from '@/lib/sanitize';

const CATEGORIES = ['feature', 'improvement', 'fix', 'breaking'] as const;

async function requireMaster(userId: string) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return u?.role === 'admin';
}

// PUT — edit entry (master only)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await requireMaster(session.user.id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { version, title, summary, category, pinned } = body;

    const data: any = {};
    if (typeof version === 'string') data.version = version.trim() || null;
    if (typeof title === 'string' && title.trim()) data.title = title.trim();
    if (typeof summary === 'string') data.summary = sanitizeRichText(summary);
    if (typeof category === 'string' && CATEGORIES.includes(category as any)) data.category = category;
    if (typeof pinned === 'boolean') data.pinned = pinned;

    const updated = await prisma.changelogEntry.update({ where: { id }, data });
    return NextResponse.json(updated);
}

// DELETE — remove entry (master only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await requireMaster(session.user.id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.changelogEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
