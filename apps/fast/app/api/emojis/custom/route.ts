import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

const NAME_RE = /^[a-z][a-z0-9_-]{1,31}$/;

// GET — list all workspace custom emojis. Open to any authed user; the picker
// loads the full list once per session and caches it on the client.
export async function GET() {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rows = await prisma.customEmoji.findMany({
        select: {
            id: true,
            name: true,
            imageUrl: true,
            creatorId: true,
            createdAt: true,
            creator: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
        rows.map((r) => ({
            id: r.id,
            name: r.name,
            imageUrl: r.imageUrl,
            creatorId: r.creatorId,
            creatorName: r.creator?.name || null,
            createdAt: r.createdAt.toISOString(),
        })),
    );
}

// POST — create a new custom emoji. Expects `{ name, imageUrl }`. The image
// itself is uploaded separately via /api/upload (which returns a URL); we
// just persist the resulting URL plus the shortcode name.
export async function POST(request: Request) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let body: { name?: string; imageUrl?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Normalize name: strip surrounding colons + lowercase. Names are unique.
    const rawName = (body.name || '').trim().replace(/^:|:$/g, '').toLowerCase();
    const imageUrl = (body.imageUrl || '').trim();

    if (!NAME_RE.test(rawName)) {
        return NextResponse.json(
            { error: 'Name must start with a letter and contain only lowercase letters, digits, "-", or "_" (2-32 chars).' },
            { status: 400 },
        );
    }
    if (!imageUrl) {
        return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    const existing = await prisma.customEmoji.findUnique({ where: { name: rawName } });
    if (existing) {
        return NextResponse.json({ error: `:${rawName}: is already taken` }, { status: 409 });
    }

    const created = await prisma.customEmoji.create({
        data: {
            name: rawName,
            imageUrl,
            creatorId: session.user.id,
        },
        select: {
            id: true,
            name: true,
            imageUrl: true,
            creatorId: true,
            createdAt: true,
            creator: { select: { name: true } },
        },
    });

    return NextResponse.json({
        id: created.id,
        name: created.name,
        imageUrl: created.imageUrl,
        creatorId: created.creatorId,
        creatorName: created.creator?.name || null,
        createdAt: created.createdAt.toISOString(),
    }, { status: 201 });
}
