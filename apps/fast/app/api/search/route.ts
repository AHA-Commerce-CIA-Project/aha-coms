import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/search?q=… — global omnibar search.
// Returns up to 8 channels and 8 tasks matching the query. Channel access
// follows the same visibility rules as /api/channels (creator / member /
// public / team-allowed). Tasks match by title OR taskToken (case-insensitive).
//
// Empty / single-char queries return empty arrays so the client doesn't fire
// a request before the user has typed anything meaningful.
export async function GET(request: Request) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    if (q.length < 2) {
        return NextResponse.json({ channels: [], tasks: [] });
    }

    const userId = session.user.id;
    const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true, email: true },
    });
    const myTeamId = me?.teamId ?? null;

    const [channels, tasks] = await Promise.all([
        prisma.channel.findMany({
            where: {
                isArchived: false,
                name: { contains: q, mode: 'insensitive' },
                OR: [
                    { createdBy: userId },
                    { members: { some: { userId } } },
                    { isPrivate: false, visibleToAllTeams: true },
                    ...(myTeamId ? [{ isPrivate: false, allowedTeamIds: { has: myTeamId } }] : []),
                ],
            },
            select: { id: true, name: true, isPrivate: true, purpose: true },
            orderBy: { updatedAt: 'desc' },
            take: 8,
        }),
        prisma.task.findMany({
            where: {
                OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { taskToken: { startsWith: q.toUpperCase() } },
                ],
            },
            select: {
                id: true,
                title: true,
                taskToken: true,
                status: true,
                urgency: true,
                targetChannel: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
        }),
    ]);

    return NextResponse.json({ channels, tasks });
}
