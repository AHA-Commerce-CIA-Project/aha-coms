import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';

async function verifyAdmin() {
    const session = await requireFastAuth();
    if (!session) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'admin') return null;
    return session;
}

// GET — Fetch a single user's public profile (any authenticated user)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [user, tasksDone, ratingAgg] = await Promise.all([
        prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                status: true,
                lastSeenAt: true,
                activeSecondsToday: true,
                activeDate: true,
                createdAt: true,
                team: { select: { name: true } },
            },
        }),
        prisma.task.count({
            where: {
                status: 'done',
                OR: [{ assigneeId: id }, { completedBy: id }],
            },
        }),
        prisma.taskReview.aggregate({
            where: {
                reviewerType: 'requester',
                task: { assigneeId: id, status: 'done' },
            },
            _avg: { rating: true },
            _count: { rating: true },
        }),
    ]);

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only count activeSecondsToday if the stored date is today (WIB)
    const WIB_OFFSET = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET);
    const todayWIB = new Date(Date.UTC(
        nowWIB.getUTCFullYear(),
        nowWIB.getUTCMonth(),
        nowWIB.getUTCDate(),
    ));
    const isToday = user.activeDate
        && new Date(user.activeDate).getTime() === todayWIB.getTime();

    const avgRaw = ratingAgg._avg.rating;
    const avgRating = avgRaw != null ? Math.round(Number(avgRaw) * 10) / 10 : null;

    return NextResponse.json({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        status: user.status,
        teamName: user.team?.name || null,
        lastSeenAt: user.lastSeenAt?.toISOString() || null,
        activeSecondsToday: isToday ? user.activeSecondsToday : 0,
        tasksDone,
        avgRating,
        ratingCount: ratingAgg._count.rating,
        joinedAt: user.createdAt.toISOString(),
    });
}

// PUT — Update user (Master/Admin only)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await verifyAdmin();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Master access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, role, team_id } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (team_id !== undefined) updateData.teamId = team_id;

    try {
        // Get current user data before update for comparison
        const before = await prisma.user.findUnique({
            where: { id },
            select: { name: true, role: true, teamId: true, email: true, team: { select: { name: true } } },
        });

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: { team: { select: { name: true } } },
        });

        // Log changes
        const changes: string[] = [];
        if (name !== undefined && before?.name !== name) changes.push(`name from "${before?.name}" to "${name}"`);
        if (role !== undefined && before?.role !== role) {
            const roleLabel = (r: string) => r === 'admin' ? 'Master' : r === 'leader' ? 'Leader' : 'Member';
            changes.push(`role from ${roleLabel(before?.role || '')} to ${roleLabel(role)}`);
        }
        if (team_id !== undefined && before?.teamId !== team_id) {
            const newTeamName = user.team?.name || 'None';
            const oldTeamName = before?.team?.name || 'None';
            changes.push(`team from "${oldTeamName}" to "${newTeamName}"`);
        }

        if (changes.length > 0) {
            logActivity(
                session.user.id,
                'user_updated',
                `${session.user.name} updated ${user.name} (${user.email}): changed ${changes.join(', ')}`,
                'user',
                id,
            );
        }

        return NextResponse.json({
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.image,
            role: user.role,
            team_id: user.teamId,
            created_at: user.createdAt.toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE — Delete user (Master/Admin only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await verifyAdmin();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Master access required' }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deleting yourself
    if (id === session.user.id) {
        return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    try {
        // Get user info before deleting for the log
        const targetUser = await prisma.user.findUnique({
            where: { id },
            select: { name: true, email: true, role: true },
        });

        // Delete user (cascading deletes will handle sessions, accounts, notifications)
        await prisma.user.delete({ where: { id } });

        if (targetUser) {
            logActivity(
                session.user.id,
                'user_deleted',
                `${session.user.name} deleted account: ${targetUser.name} (${targetUser.email})`,
                'user',
                id,
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
