import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET — Get details for a dashboard stat card
// type: 'completed' | 'active' | 'team'
export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, teamId: true },
    });
    if (!user) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    if (type === 'completed') {
        const tasks = await prisma.task.findMany({
            where: { assigneeId: session.user.id, status: 'done' },
            select: {
                id: true,
                title: true,
                urgency: true,
                taskToken: true,
                requesterName: true,
                completedAt: true,
                createdAt: true,
            },
            orderBy: { completedAt: 'desc' },
            take: 50,
        });
        return NextResponse.json(tasks.map(t => ({
            id: t.id,
            title: t.title,
            urgency: t.urgency,
            task_token: t.taskToken,
            requester_name: t.requesterName,
            completed_at: t.completedAt?.toISOString() || null,
            created_at: t.createdAt.toISOString(),
        })));
    }

    if (type === 'active') {
        const tasks = await prisma.task.findMany({
            where: {
                assigneeId: session.user.id,
                NOT: { status: { in: ['done', 'archived'] } },
            },
            select: {
                id: true,
                title: true,
                status: true,
                urgency: true,
                taskToken: true,
                requesterName: true,
                dueDate: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        return NextResponse.json(tasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            urgency: t.urgency,
            task_token: t.taskToken,
            requester_name: t.requesterName,
            due_date: t.dueDate,
            created_at: t.createdAt.toISOString(),
        })));
    }

    if (type === 'team') {
        if (!user.teamId) return NextResponse.json([]);
        const members = await prisma.user.findMany({
            where: { teamId: user.teamId },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                status: true,
                team: { select: { name: true } },
            },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json(members.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email,
            image: m.image,
            role: m.role,
            status: m.status,
            team_name: m.team?.name || null,
        })));
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
