import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/teams/public — returns the minimal team list (id + name) used by
// the public request form to route a request to the team that should fulfil
// it. No auth required because the request form itself is public.
export async function GET() {
    const teams = await prisma.team.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
    return NextResponse.json(teams);
}
