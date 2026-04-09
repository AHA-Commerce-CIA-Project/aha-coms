import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch all teams
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const teams = await prisma.team.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });

    return NextResponse.json(teams);
}
