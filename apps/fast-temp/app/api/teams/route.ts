import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch all teams (optionally include members)
export async function GET(request: Request) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeMembers = searchParams.get('include') === 'members';

    const teams = await prisma.team.findMany({
        select: {
            id: true,
            name: true,
            mentionHandle: true,
            ...(includeMembers ? {
                users: {
                    select: { id: true, name: true, email: true, image: true },
                    orderBy: { name: 'asc' as const },
                },
            } : {}),
        },
        orderBy: { name: 'asc' },
    });

    return NextResponse.json(teams);
}
