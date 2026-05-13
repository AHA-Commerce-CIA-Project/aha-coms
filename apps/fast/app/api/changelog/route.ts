import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { sanitizeRichText } from '@/lib/sanitize';

const CATEGORIES = ['feature', 'improvement', 'fix', 'breaking'] as const;

// GET — list all entries (any authenticated user) + unseen count
export async function GET() {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [entries, user] = await Promise.all([
        prisma.changelogEntry.findMany({
            orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        }),
        prisma.user.findUnique({
            where: { id: session.user.id },
            select: { lastChangelogSeenAt: true },
        }),
    ]);

    const lastSeen = user?.lastChangelogSeenAt;
    const unseenCount = lastSeen
        ? entries.filter(e => e.publishedAt > lastSeen).length
        : entries.length;

    return NextResponse.json({
        entries: entries.map(e => ({
            id: e.id,
            version: e.version,
            title: e.title,
            summary: e.summary,
            category: e.category,
            pinned: e.pinned,
            publishedAt: e.publishedAt.toISOString(),
            isNew: !lastSeen || e.publishedAt > lastSeen,
        })),
        unseenCount,
    });
}

// POST — create entry (master only)
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const caller = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });
    if (caller?.role !== 'admin') {
        return NextResponse.json({ error: 'Only master can publish changelog entries' }, { status: 403 });
    }

    const body = await request.json();
    const { version, title, summary, category, pinned } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!summary || typeof summary !== 'string') {
        return NextResponse.json({ error: 'Summary is required' }, { status: 400 });
    }
    if (category && !CATEGORIES.includes(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const entry = await prisma.changelogEntry.create({
        data: {
            version: version?.trim() || null,
            title: title.trim(),
            summary: sanitizeRichText(summary),
            category: category || 'feature',
            pinned: !!pinned,
            createdBy: session.user.id,
        },
    });

    return NextResponse.json(entry, { status: 201 });
}
