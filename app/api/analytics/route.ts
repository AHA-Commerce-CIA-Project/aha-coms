import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// GET — Fetch all tasks for analytics (requires auth)
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth();
    if (!session) {
        return errorResponse('Not authenticated', 401);
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // Build date filter
    const dateFilter: any = {};
    if (dateFrom) {
        dateFilter.gte = new Date(dateFrom);
    }
    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        dateFilter.lt = toDate;
    }

    const tasks = await prisma.task.findMany({
        where: {
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        include: {
            assignee: { select: { name: true } },
            completedByUser: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Compute all analytics server-side
    const activeTasks = tasks.filter(t => t.status !== 'archived');

    const totalTickets = activeTasks.length;
    const completedTickets = activeTasks.filter(t => t.status === 'done').length;
    const completionRate = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;

    // Average completion time
    const completedWithTime = activeTasks.filter(t => t.completedAt && t.createdAt);
    let avgCompletionHours = 0;
    if (completedWithTime.length > 0) {
        const totalHours = completedWithTime.reduce((sum, t) => {
            if (t.actualTimeSpent) {
                const hours = t.timeUnit === 'hours' ? t.actualTimeSpent : t.actualTimeSpent / 60;
                return sum + hours;
            }
            const diff = new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime();
            return sum + diff / 3600000;
        }, 0);
        avgCompletionHours = Math.round(totalHours / completedWithTime.length * 10) / 10;
    }

    // Average difficulty score
    const scored = activeTasks.filter(t => t.difficultyScore != null);
    const avgDifficulty = scored.length > 0
        ? Math.round(scored.reduce((sum, t) => sum + (t.difficultyScore || 0), 0) / scored.length * 10) / 10
        : null;

    // Tickets by urgency
    const urgencyCounts: Record<string, number> = {};
    activeTasks.forEach(t => {
        const u = t.urgency || 'Unset';
        urgencyCounts[u] = (urgencyCounts[u] || 0) + 1;
    });

    // Tickets by division
    const divisionCounts: Record<string, number> = {};
    activeTasks.forEach(t => {
        const d = t.requesterDivision || 'Internal';
        divisionCounts[d] = (divisionCounts[d] || 0) + 1;
    });

    // Period completions
    const now = new Date();
    let periodLabel = 'This Week';
    let periodStart: Date;

    if (dateFrom) {
        periodStart = new Date(dateFrom);
        periodLabel = 'Selected Period';
    } else {
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
    }

    const completedInPeriod = activeTasks.filter(t => {
        if (!t.completedAt || t.status !== 'done') return false;
        return new Date(t.completedAt) >= periodStart;
    }).length;

    // Top performers
    const performerCounts: Record<string, number> = {};
    activeTasks.filter(t => t.status === 'done').forEach(t => {
        const name = t.completedByUser?.name || t.assignee?.name || 'Unknown';
        performerCounts[name] = (performerCounts[name] || 0) + 1;
    });
    const topPerformers = Object.entries(performerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    activeTasks.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });

    // Team member ratings
    const teamRatings = await prisma.$queryRaw<{ name: string; avg_rating: number; review_count: number }[]>`
        SELECT u.name,
               ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
               COUNT(r.id)::int as review_count
        FROM task_reviews r
        JOIN tasks t ON r.task_id = t.id
        JOIN "user" u ON t.assignee_id = u.id
        WHERE r.reviewer_type = 'requester'
          AND t.status = 'done'
        GROUP BY u.id, u.name
        ORDER BY avg_rating DESC, review_count DESC
    `;

    return successResponse({
        totalTickets,
        completedTickets,
        completionRate,
        avgCompletionHours,
        avgDifficulty,
        urgencyCounts,
        divisionCounts,
        completedInPeriod,
        periodLabel,
        topPerformers,
        statusCounts,
        teamRatings: teamRatings.map(r => ({
            name: r.name,
            avgRating: Number(r.avg_rating),
            reviewCount: Number(r.review_count),
        })),
    });
});
