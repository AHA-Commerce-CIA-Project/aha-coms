import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';

export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            status: true,
            accountStatus: true,
            teamId: true,
            team: { select: { name: true } },
            createdAt: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.image,
        role: user.role,
        status: user.status,
        account_status: user.accountStatus,
        team_id: user.teamId,
        team_name: user.team?.name || null,
        created_at: user.createdAt.toISOString(),
    });
}

// PATCH /api/profile - Update profile
export async function PATCH(request: Request) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, status, image } = body;

    const updateData: any = {};

    if (name && typeof name === 'string' && name.trim().length > 0) {
        updateData.name = name.trim();
    }

    if (status && ['active', 'away', 'busy', 'offline'].includes(status)) {
        updateData.status = status;
    }

    if (image !== undefined) {
        updateData.image = image;
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updateData.updatedAt = new Date();

    const user = await prisma.user.update({
        where: { id: session.user.id },
        data: updateData,
        select: {
            id: true,
            name: true,
            image: true,
            status: true,
        },
    });

    // Log what changed
    const changes: string[] = [];
    if (name) changes.push('display name');
    if (status) changes.push(`status to "${status}"`);
    if (image !== undefined) changes.push('profile picture');
    logActivity(session.user.id, 'profile_updated', `${user.name} updated their ${changes.join(', ')}`, 'user', session.user.id);

    return NextResponse.json(user);
}
