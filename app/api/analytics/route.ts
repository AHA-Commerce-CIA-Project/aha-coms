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
    const teamRatings = await prisma.$queryRaw<{
        id: string;
        name: string;
        image: string | null;
        role: string;
        avg_rating: number;
        review_count: number;
    }[]>`
        SELECT u.id,
               u.name,
               u.image,
               u.role,
               ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
               COUNT(r.id)::int as review_count
        FROM task_reviews r
        JOIN tasks t ON r.task_id = t.id
        JOIN "user" u ON t.assignee_id = u.id
        WHERE r.reviewer_type = 'requester'
          AND t.status = 'done'
        GROUP BY u.id, u.name, u.image, u.role
        ORDER BY avg_rating DESC, review_count DESC
    `;

    // Top Members by Active Hours (today, WIB)
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    const todayWIB = new Date(Date.UTC(
        nowWIB.getUTCFullYear(),
        nowWIB.getUTCMonth(),
        nowWIB.getUTCDate(),
    ));
    const [activeUsers, allTimeUsers] = await Promise.all([
        prisma.user.findMany({
            where: {
                accountStatus: 'active',
                role: { not: 'admin' },
                activeDate: todayWIB,
                activeSecondsToday: { gt: 0 },
            },
            select: { id: true, name: true, image: true, role: true, activeSecondsToday: true },
            orderBy: { activeSecondsToday: 'desc' },
        }),
        prisma.user.findMany({
            where: {
                accountStatus: 'active',
                role: { not: 'admin' },
                totalActiveSeconds: { gt: 0 },
            },
            select: { id: true, name: true, image: true, role: true, totalActiveSeconds: true },
            orderBy: { totalActiveSeconds: 'desc' },
        }),
    ]);
    const topActiveMembers = activeUsers.map(u => ({
        id: u.id,
        name: u.name,
        image: u.image,
        role: u.role,
        activeSeconds: u.activeSecondsToday,
    }));
    const allTimeActiveMembers = allTimeUsers.map(u => ({
        id: u.id,
        name: u.name,
        image: u.image,
        role: u.role,
        activeSeconds: u.totalActiveSeconds,
    }));

    // Top Requesters analytics
    const requesterAgg: Record<string, {
        name: string;
        division: string;
        total: number;
        completed: number;
        priorities: Record<string, number>;
        totalResolutionHours: number;
        resolvedCount: number;
        totalRating: number;
        ratingCount: number;
    }> = {};

    for (const t of tasks) {
        const key = (t.requesterName || 'Unknown').trim();
        if (!requesterAgg[key]) {
            requesterAgg[key] = {
                name: key,
                division: t.requesterDivision || 'Unknown',
                total: 0,
                completed: 0,
                priorities: {},
                totalResolutionHours: 0,
                resolvedCount: 0,
                totalRating: 0,
                ratingCount: 0,
            };
        }
        const r = requesterAgg[key];
        r.total++;
        const urg = t.urgency || 'Unset';
        r.priorities[urg] = (r.priorities[urg] || 0) + 1;
        if (t.status === 'done') {
            r.completed++;
            if (t.completedAt && t.createdAt) {
                const hrs = t.actualTimeSpent
                    ? (t.timeUnit === 'hours' ? t.actualTimeSpent : t.actualTimeSpent / 60)
                    : (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
                r.totalResolutionHours += hrs;
                r.resolvedCount++;
            }
        }
    }

    // Attach requester review ratings
    const requesterReviews = await prisma.taskReview.findMany({
        where: { reviewerType: 'requester' },
        select: { rating: true, reviewerName: true },
    });
    for (const rv of requesterReviews) {
        const key = (rv.reviewerName || 'Unknown').trim();
        if (requesterAgg[key]) {
            requesterAgg[key].totalRating += rv.rating;
            requesterAgg[key].ratingCount++;
        }
    }

    // ───── Leader analytics — independent of the page date filter ─────
    // All periods are computed in WIB (UTC+7) since the rest of the app uses
    // WIB for activity tracking.
    const PENDING_STATUSES = ['todo', 'in-progress', 'review', 'pending_completion_details'];
    const nowWIBClock = new Date(Date.now() + WIB_OFFSET_MS);
    const yWIB = nowWIBClock.getUTCFullYear();
    const mWIB = nowWIBClock.getUTCMonth();
    const dWIB = nowWIBClock.getUTCDate();
    const dowWIB = nowWIBClock.getUTCDay();
    const daysToMonday = (dowWIB + 6) % 7;

    // Absolute UTC instants matching WIB calendar boundaries (for Timestamptz columns)
    const todayStartUTC = new Date(Date.UTC(yWIB, mWIB, dWIB) - WIB_OFFSET_MS);
    const weekStartUTC = new Date(todayStartUTC.getTime() - daysToMonday * 86400000);
    const monthStartUTC = new Date(Date.UTC(yWIB, mWIB, 1) - WIB_OFFSET_MS);
    const thirtyDaysAgoUTC = new Date(Date.now() - 30 * 86400000);

    // WIB date values for the @db.Date column on UserActivityDaily
    const todayWIBDate = new Date(Date.UTC(yWIB, mWIB, dWIB));
    const weekStartWIBDate = new Date(todayWIBDate.getTime() - daysToMonday * 86400000);
    const monthStartWIBDate = new Date(Date.UTC(yWIB, mWIB, 1));

    type LeaderRow = { id: string; name: string; image: string | null; count: number };
    const aggregateBy = <T>(
        rows: T[],
        pick: (r: T) => { id: string; name: string; image: string | null } | null,
        limit = 50,
    ): LeaderRow[] => {
        const m: Record<string, LeaderRow> = {};
        for (const r of rows) {
            const u = pick(r);
            if (!u) continue;
            if (!m[u.id]) m[u.id] = { id: u.id, name: u.name, image: u.image, count: 0 };
            m[u.id].count++;
        }
        return Object.values(m).sort((a, b) => b.count - a.count).slice(0, limit);
    };

    // ── Pending: This Week + L30D, grouped by assignee
    const pendingWhereThisWeek = {
        createdAt: { gte: weekStartUTC },
        status: { in: PENDING_STATUSES },
        assigneeId: { not: null },
    } as const;
    const pendingWhereL30D = {
        createdAt: { gte: thirtyDaysAgoUTC },
        status: { in: PENDING_STATUSES },
        assigneeId: { not: null },
    } as const;
    const [pendingThisWeekRows, pendingL30DRows] = await Promise.all([
        prisma.task.findMany({
            where: pendingWhereThisWeek,
            select: { assignee: { select: { id: true, name: true, image: true } } },
        }),
        prisma.task.findMany({
            where: pendingWhereL30D,
            select: { assignee: { select: { id: true, name: true, image: true } } },
        }),
    ]);
    const topPending = {
        thisWeek: aggregateBy(pendingThisWeekRows, (t) => t.assignee),
        l30d: aggregateBy(pendingL30DRows, (t) => t.assignee),
    };

    // ── Done: Today, This Week, L30D, All Time, grouped by completer
    const baseDone = { status: 'done', completedBy: { not: null } } as const;
    const [doneTodayRows, doneWeekRows, doneL30dRows, doneAllRows] = await Promise.all([
        prisma.task.findMany({
            where: { ...baseDone, completedAt: { gte: todayStartUTC } },
            select: { completedByUser: { select: { id: true, name: true, image: true } } },
        }),
        prisma.task.findMany({
            where: { ...baseDone, completedAt: { gte: weekStartUTC } },
            select: { completedByUser: { select: { id: true, name: true, image: true } } },
        }),
        prisma.task.findMany({
            where: { ...baseDone, completedAt: { gte: thirtyDaysAgoUTC } },
            select: { completedByUser: { select: { id: true, name: true, image: true } } },
        }),
        prisma.task.findMany({
            where: baseDone,
            select: { completedByUser: { select: { id: true, name: true, image: true } } },
        }),
    ]);
    const topDone = {
        today: aggregateBy(doneTodayRows, (t) => t.completedByUser),
        thisWeek: aggregateBy(doneWeekRows, (t) => t.completedByUser),
        l30d: aggregateBy(doneL30dRows, (t) => t.completedByUser),
        allTime: aggregateBy(doneAllRows, (t) => t.completedByUser),
    };

    // ── Active hours: Today / This Week / This Month (from daily snapshots)
    type ActiveRow = { id: string; name: string; image: string | null; role: string; activeSeconds: number };
    const buildActiveRows = async (sinceWIBDate: Date): Promise<ActiveRow[]> => {
        const rows = await prisma.userActivityDaily.groupBy({
            by: ['userId'],
            where: { date: { gte: sinceWIBDate }, activeSeconds: { gt: 0 } },
            _sum: { activeSeconds: true },
        });
        if (rows.length === 0) return [];
        const userIds = rows.map(r => r.userId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds }, accountStatus: 'active', role: { not: 'admin' } },
            select: { id: true, name: true, image: true, role: true },
        });
        const userMap = Object.fromEntries(users.map(u => [u.id, u]));
        return rows
            .map(r => {
                const u = userMap[r.userId];
                if (!u) return null;
                return {
                    id: u.id,
                    name: u.name,
                    image: u.image,
                    role: u.role,
                    activeSeconds: r._sum.activeSeconds || 0,
                } satisfies ActiveRow;
            })
            .filter((x): x is ActiveRow => x !== null && x.activeSeconds > 0)
            .sort((a, b) => b.activeSeconds - a.activeSeconds);
    };
    const [activeWeekRows, activeMonthRows] = await Promise.all([
        buildActiveRows(weekStartWIBDate),
        buildActiveRows(monthStartWIBDate),
    ]);

    // ── Top Requesters: per-period (independent of the page date filter)
    // We rebuild the aggregate per period to keep the priority/completion mix
    // accurate for that window.
    type RequesterPeriodKey = 'thisWeek' | 'l30d' | 'allTime';
    const requesterReviewMap: Record<string, { total: number; count: number }> = {};
    for (const rv of requesterReviews) {
        const key = (rv.reviewerName || 'Unknown').trim();
        if (!requesterReviewMap[key]) requesterReviewMap[key] = { total: 0, count: 0 };
        requesterReviewMap[key].total += rv.rating;
        requesterReviewMap[key].count += 1;
    }

    const buildRequesterTop = async (key: RequesterPeriodKey): Promise<{
        name: string;
        division: string;
        total: number;
        completed: number;
        completionRate: number;
        priorities: Record<string, number>;
        avgResolutionHours: number | null;
        avgRating: number | null;
        ratingCount: number;
    }[]> => {
        const where: Record<string, unknown> = {};
        if (key === 'thisWeek') where.createdAt = { gte: weekStartUTC };
        else if (key === 'l30d') where.createdAt = { gte: thirtyDaysAgoUTC };
        // allTime: no filter

        const rows = await prisma.task.findMany({
            where,
            select: {
                requesterName: true,
                requesterDivision: true,
                urgency: true,
                status: true,
                createdAt: true,
                completedAt: true,
                actualTimeSpent: true,
                timeUnit: true,
            },
        });

        const agg: Record<string, {
            name: string;
            division: string;
            total: number;
            completed: number;
            priorities: Record<string, number>;
            totalResolutionHours: number;
            resolvedCount: number;
        }> = {};
        for (const t of rows) {
            const name = (t.requesterName || 'Unknown').trim();
            if (!agg[name]) {
                agg[name] = {
                    name,
                    division: t.requesterDivision || 'Unknown',
                    total: 0,
                    completed: 0,
                    priorities: {},
                    totalResolutionHours: 0,
                    resolvedCount: 0,
                };
            }
            const r = agg[name];
            r.total++;
            const urg = t.urgency || 'Unset';
            r.priorities[urg] = (r.priorities[urg] || 0) + 1;
            if (t.status === 'done') {
                r.completed++;
                if (t.completedAt && t.createdAt) {
                    const hrs = t.actualTimeSpent
                        ? (t.timeUnit === 'hours' ? t.actualTimeSpent : t.actualTimeSpent / 60)
                        : (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
                    r.totalResolutionHours += hrs;
                    r.resolvedCount++;
                }
            }
        }

        return Object.values(agg)
            .sort((a, b) => b.total - a.total)
            .slice(0, 50)
            .map(r => {
                const review = requesterReviewMap[r.name];
                return {
                    name: r.name,
                    division: r.division,
                    total: r.total,
                    completed: r.completed,
                    completionRate: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0,
                    priorities: r.priorities,
                    avgResolutionHours: r.resolvedCount > 0
                        ? Math.round((r.totalResolutionHours / r.resolvedCount) * 10) / 10
                        : null,
                    avgRating: review && review.count > 0
                        ? Math.round((review.total / review.count) * 10) / 10
                        : null,
                    ratingCount: review?.count || 0,
                };
            });
    };

    const [requestersThisWeek, requestersL30D, requestersAllTime] = await Promise.all([
        buildRequesterTop('thisWeek'),
        buildRequesterTop('l30d'),
        buildRequesterTop('allTime'),
    ]);

    const topRequestersByPeriod = {
        thisWeek: requestersThisWeek,
        l30d: requestersL30D,
        allTime: requestersAllTime,
    };

    // Legacy single-list top requesters for any consumer that still reads it.
    const topRequesters = requestersAllTime.slice(0, 15);

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
            id: r.id,
            name: r.name,
            image: r.image,
            role: r.role,
            avgRating: Number(r.avg_rating),
            reviewCount: Number(r.review_count),
        })),
        topActiveMembers,
        allTimeActiveMembers,
        topRequesters,
        topRequestersByPeriod,
        topPending,
        topDone,
        activeByPeriod: {
            today: topActiveMembers,         // unchanged — sourced from User.activeSecondsToday
            thisWeek: activeWeekRows,
            thisMonth: activeMonthRows,
        },
    });
});
