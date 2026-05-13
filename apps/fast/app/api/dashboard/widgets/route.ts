import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

export async function GET() {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, teamId: true, activeSecondsToday: true, activeDate: true },
    });
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Active time today (WIB) — only count if activeDate is today (WIB)
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB_ = new Date(Date.now() + WIB_OFFSET_MS);
    const todayWIB_ = new Date(Date.UTC(
        nowWIB_.getUTCFullYear(),
        nowWIB_.getUTCMonth(),
        nowWIB_.getUTCDate(),
    ));
    const isToday = user.activeDate &&
        new Date(user.activeDate).getTime() === todayWIB_.getTime();
    const activeSecondsToday = isToday ? user.activeSecondsToday : 0;

    // My active tasks (urgent/today) — primary assignee OR approved helper
    const myTasks = await prisma.task.findMany({
        where: {
            OR: [
                { assigneeId: session.user.id },
                { collaborators: { some: { userId: session.user.id, status: 'approved' } } },
            ],
            status: { in: ['in-progress', 'todo', 'review', 'pending_completion_details'] },
        },
        select: {
            id: true, title: true, status: true, urgency: true, dueDate: true, taskToken: true,
            requesterName: true, createdAt: true, source: true,
        },
        orderBy: [{ urgency: 'asc' }, { createdAt: 'desc' }],
        take: 8,
    });

    // Pending direct requests
    const pendingDirectRequests = await prisma.task.findMany({
        where: { directAssigneeId: session.user.id, status: 'pending_approval' },
        select: {
            id: true, title: true, urgency: true, requesterName: true, requesterDivision: true,
            createdAt: true, taskToken: true, responseDeadline: true, description: true,
            status: true, attachmentLink: true, dueDate: true, requestType: true, requesterEmail: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    // Recent activity — user-relevant only (exclude sensitive admin-only actions)
    const sensitiveActions = [
        'user_created', 'user_updated', 'user_deleted', 'user_confirmed',
        'user_approved', 'user_rejected', 'password_changed', 'profile_updated',
        'account_activated', 'user_registered',
    ];

    // Get team members IDs for filtering activity to teammates
    const teamMemberIds = user.teamId
        ? (await prisma.user.findMany({
            where: { teamId: user.teamId },
            select: { id: true },
        })).map(u => u.id)
        : [session.user.id];

    const recentActivity = await prisma.activityLog.findMany({
        where: {
            action: { notIn: sensitiveActions },
            userId: { in: teamMemberIds },
        },
        include: { user: { select: { name: true, image: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });

    // Team members
    let teamMembers: any[] = [];
    if (user.teamId) {
        teamMembers = await prisma.user.findMany({
            where: { teamId: user.teamId, accountStatus: 'active' },
            select: { id: true, name: true, email: true, image: true, role: true, status: true, lastSeenAt: true },
            orderBy: { name: 'asc' },
        });
    }

    // Stats & Insights — include tasks where user is approved helper so collaboration
    // shows up in personal stats (completion rate, avg difficulty, thisWeekCompleted).
    const allMyTasks = await prisma.task.findMany({
        where: {
            OR: [
                { assigneeId: session.user.id },
                { collaborators: { some: { userId: session.user.id, status: 'approved' } } },
            ],
            NOT: { status: 'archived' },
        },
        select: { status: true, urgency: true, createdAt: true, completedAt: true, actualTimeSpent: true, timeUnit: true, difficultyScore: true },
    });
    const completedCount = allMyTasks.filter(t => t.status === 'done').length;
    const activeCount = allMyTasks.filter(t => t.status !== 'done').length;
    const totalCount = allMyTasks.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Avg resolution time (hours)
    const completedWithTime = allMyTasks.filter(t => t.completedAt && t.createdAt && t.status === 'done');
    let avgResolutionHours = 0;
    if (completedWithTime.length > 0) {
        const totalMs = completedWithTime.reduce((sum, t) => sum + (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()), 0);
        avgResolutionHours = Math.round(totalMs / completedWithTime.length / 3600000);
    }

    // Avg difficulty
    const withDifficulty = allMyTasks.filter(t => t.difficultyScore);
    const avgDifficulty = withDifficulty.length > 0
        ? Math.round(withDifficulty.reduce((s, t) => s + (t.difficultyScore || 0), 0) / withDifficulty.length * 10) / 10
        : null;

    // Urgency breakdown
    const urgencyBreakdown: Record<string, number> = {};
    allMyTasks.forEach(t => {
        const u = t.urgency || 'Unset';
        urgencyBreakdown[u] = (urgencyBreakdown[u] || 0) + 1;
    });

    // This week's progress
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeekCompleted = allMyTasks.filter(t => t.status === 'done' && t.completedAt && new Date(t.completedAt) >= weekStart).length;

    // Orbit claims count
    const orbitClaimsCount = await prisma.routineTaskClaim.count({
        where: { claimedBy: session.user.id },
    });
    const orbitCompletedCount = await prisma.routineTaskClaim.count({
        where: { claimedBy: session.user.id, status: 'completed' },
    });

    // Average rating for my completed tasks (from requester reviews)
    const myReviews = await prisma.taskReview.findMany({
        where: {
            reviewerType: 'requester',
            task: { assigneeId: session.user.id, status: 'done' },
        },
        select: { rating: true },
    });
    const avgRating = myReviews.length > 0
        ? Math.round((myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length) * 10) / 10
        : null;
    const totalReviews = myReviews.length;

    return NextResponse.json({
        myTasks,
        pendingDirectRequests,
        recentActivity: recentActivity.map(a => ({
            id: a.id,
            action: a.action,
            description: a.description,
            createdAt: a.createdAt.toISOString(),
            user: a.user,
        })),
        teamMembers,
        stats: { completed: completedCount, active: activeCount, total: totalCount, teamCount: teamMembers.length },
        insights: {
            completionRate,
            avgResolutionHours,
            avgDifficulty,
            urgencyBreakdown,
            thisWeekCompleted,
            orbitClaims: orbitClaimsCount,
            orbitCompleted: orbitCompletedCount,
            avgRating,
            totalReviews,
            activeSecondsToday,
        },
    });
}
