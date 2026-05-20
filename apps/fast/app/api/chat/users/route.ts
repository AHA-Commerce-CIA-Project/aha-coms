import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// GET — List users for starting a new DM (any authenticated user can access).
// Supports pagination via `take` (default 50, max 200) and `skip` query params.
export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const take = Math.min(Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE), MAX_TAKE);
    const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);

    const users = await prisma.user.findMany({
        where: {
            id: { not: session.user.id }, // Exclude current user
        },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            lastSeenAt: true,
            team: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take,
        skip,
    });

    const data = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
        teamName: u.team?.name || null,
    }));

    return NextResponse.json(data);
}
