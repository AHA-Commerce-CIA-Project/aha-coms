import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch teammates (same team_id as the current user)
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { teamId: true },
    });

    if (!user?.teamId) {
        return NextResponse.json([]);
    }

    const teammates = await prisma.user.findMany({
        where: { teamId: user.teamId },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
    });

    return NextResponse.json(teammates);
}
