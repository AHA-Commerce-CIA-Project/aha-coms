import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — List all users for starting a new DM (any authenticated user can access)
export async function GET() {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
