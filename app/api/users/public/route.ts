import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — Fetch all users for public dropdowns (id and name only)
export async function GET() {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            team: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
    });

    // Map to the old format expected by the frontend
    const data = users.map(u => ({
        id: u.id,
        name: u.name,
        teams: u.team ? { name: u.team.name } : null,
    }));

    return NextResponse.json(data);
}
