import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { computeDashboardInsights } from '@/lib/dashboard-insights';

const SENSITIVE_ACTIONS = [
    'user_created', 'user_updated', 'user_deleted', 'user_confirmed',
    'user_approved', 'user_rejected', 'password_changed', 'profile_updated',
    'account_activated', 'user_registered',
] as const;

const ACTIVE_TASK_STATUSES = ['in-progress', 'todo', 'review', 'pending_completion_details'] as const;

// Window the bounded "completed task timing" findMany — covers this-week +
// avg resolution + avg difficulty in one bounded read. The dashboard never
// surfaces resolution time from pre-90d-ago history, and unbounded reads
// were the largest hotspot in the old implementation.
const COMPLETED_TASK_WINDOW_DAYS = 90;

export async function GET() {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const userId = session.user.id;
    const teamId = session.user.teamId;

    const myTasksFilter = {
        OR: [
            { assigneeId: userId },
            { collaborators: { some: { userId, status: 'approved' } } },
        ],
    };

    const ninetyDaysAgo = new Date(Date.now() - COMPLETED_TASK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Phase 1 — all independent queries fan out in parallel. The old endpoint
    // awaited each sequentially; on Cloud SQL the round-trip stack-up was the
    // bulk of dashboard TTFB.
    const [
        userActive,
        myTasks,
        pendingDirectRequests,
        teamMembers,
        statusGroups,
        urgencyGroups,
        completedTasksTime,
        orbitGroups,
        reviews,
    ] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { activeSecondsToday: true, activeDate: true },
        }),
        prisma.task.findMany({
            where: { ...myTasksFilter, status: { in: ACTIVE_TASK_STATUSES as unknown as string[] } },
            select: {
                id: true, title: true, status: true, urgency: true, dueDate: true, taskToken: true,
                requesterName: true, createdAt: true, source: true,
            },
            orderBy: [{ urgency: 'asc' }, { createdAt: 'desc' }],
            take: 8,
        }),
        prisma.task.findMany({
            where: { directAssigneeId: userId, status: 'pending_approval' },
            select: {
                id: true, title: true, urgency: true, requesterName: true, requesterDivision: true,
                createdAt: true, taskToken: true, responseDeadline: true, description: true,
                status: true, attachmentLink: true, dueDate: true, requestType: true, requesterEmail: true,
            },
            orderBy: { createdAt: 'desc' },
        }),
        teamId
            ? prisma.user.findMany({
                where: { teamId, accountStatus: 'active' },
                select: { id: true, name: true, email: true, image: true, role: true, status: true, lastSeenAt: true },
                orderBy: { name: 'asc' },
            })
            : Promise.resolve([] as Array<{ id: string; name: string; email: string; image: string | null; role: string; status: string | null; lastSeenAt: Date | null }>),
        prisma.task.groupBy({
            by: ['status'],
            where: { ...myTasksFilter, NOT: { status: 'archived' } },
            _count: { _all: true },
        }),
        prisma.task.groupBy({
            by: ['urgency'],
            where: { ...myTasksFilter, NOT: { status: 'archived' } },
            _count: { _all: true },
        }),
        prisma.task.findMany({
            where: {
                ...myTasksFilter,
                status: 'done',
                completedAt: { gte: ninetyDaysAgo },
            },
            select: { createdAt: true, completedAt: true, difficultyScore: true },
        }),
        prisma.routineTaskClaim.groupBy({
            by: ['status'],
            where: { claimedBy: userId },
            _count: { _all: true },
        }),
        prisma.taskReview.findMany({
            where: {
                reviewerType: 'requester',
                task: { assigneeId: userId, status: 'done' },
            },
            select: { rating: true },
        }),
    ]);

    // Phase 2 — recentActivity depends on the team member IDs. Derive them
    // from the teamMembers row set instead of a second user.findMany.
    const teamMemberIds = teamId ? teamMembers.map((m) => m.id) : [userId];

    const recentActivity = await prisma.activityLog.findMany({
        where: {
            action: { notIn: SENSITIVE_ACTIONS as unknown as string[] },
            userId: { in: teamMemberIds },
        },
        include: { user: { select: { name: true, image: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });

    // Active time today (WIB) — only count if activeDate is today (WIB).
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    const todayWIB = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate()));
    const isToday = userActive?.activeDate &&
        new Date(userActive.activeDate).getTime() === todayWIB.getTime();
    const activeSecondsToday = isToday ? (userActive?.activeSecondsToday ?? 0) : 0;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const { stats, insights } = computeDashboardInsights({
        statusGroups,
        urgencyGroups,
        completedTasksTime,
        orbitGroups,
        reviews,
        weekStart,
        now,
    });

    return NextResponse.json({
        myTasks,
        pendingDirectRequests,
        recentActivity: recentActivity.map((a) => ({
            id: a.id,
            action: a.action,
            description: a.description,
            createdAt: a.createdAt.toISOString(),
            user: a.user,
        })),
        teamMembers,
        stats: { ...stats, teamCount: teamMembers.length },
        insights: { ...insights, activeSecondsToday },
    });
}
