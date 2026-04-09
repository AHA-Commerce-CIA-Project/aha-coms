import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, teamId: true },
    });

    if (!user) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';

    // Team members count
    let teamMemberCount = 0;
    if (user.teamId) {
        teamMemberCount = await prisma.user.count({
            where: { teamId: user.teamId },
        });
    }

    // All tasks assigned to the user
    const tasks = await prisma.task.findMany({
        where: {
            assigneeId: session.user.id,
            NOT: { status: 'archived' },
        },
        select: {
            id: true,
            status: true,
            urgency: true,
            difficultyScore: true,
            createdAt: true,
            completedAt: true,
            actualTimeSpent: true,
            timeUnit: true,
            completedBy: true,
            assigneeId: true,
        },
    });

    // Top-level KPIs
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const activeTasks = tasks.filter(t => t.status !== 'done').length;
    const totalTickets = tasks.length;
    const completionRate = totalTickets > 0 ? Math.round((completedTasks / totalTickets) * 100) : 0;

    // Avg resolution time
    const completedWithTime = tasks.filter(t => t.completedAt && t.createdAt && t.status === 'done');
    let avgResolutionHours = 0;
    if (completedWithTime.length > 0) {
        const totalHours = completedWithTime.reduce((sum, t) => {
            if (t.actualTimeSpent) {
                return sum + (t.timeUnit === 'hours' ? t.actualTimeSpent : t.actualTimeSpent / 60);
            }
            const diff = new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime();
            return sum + diff / 3600000;
        }, 0);
        avgResolutionHours = Math.round(totalHours / completedWithTime.length * 10) / 10;
    }

    // Avg difficulty
    const scored = tasks.filter(t => t.difficultyScore != null);
    const avgDifficulty = scored.length > 0
        ? Math.round(scored.reduce((sum, t) => sum + (t.difficultyScore || 0), 0) / scored.length * 10) / 10
        : null;

    // Progress stats filtered by period
    const now = new Date();
    let periodStart: Date;
    let periodLabel: string;

    if (period === 'day') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodLabel = 'Today';
    } else if (period === 'month') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = 'This Month';
    } else {
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
        periodLabel = 'This Week';
    }

    const periodTasks = tasks.filter(t => new Date(t.createdAt) >= periodStart);

    const progressStats = {
        completed: periodTasks.filter(t => t.status === 'done').length,
        inProgress: periodTasks.filter(t => t.status === 'in-progress').length,
        inReview: periodTasks.filter(t => t.status === 'review').length,
        todo: periodTasks.filter(t => t.status === 'todo').length,
    };

    return NextResponse.json({
        completedTasks,
        activeTasks,
        teamMemberCount,
        totalTickets,
        completionRate,
        avgResolutionHours,
        avgDifficulty,
        periodLabel,
        progressStats,
    });
}
