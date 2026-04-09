import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

async function verifyLeader() {
    const session = await requireAuth();
    if (!session) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'leader' && user?.role !== 'admin') return null;
    return session;
}

// PUT — Update user
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await verifyLeader();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Leader access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, role, team_id } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (team_id !== undefined) updateData.teamId = team_id;

    try {
        const user = await prisma.user.update({
            where: { id },
            data: updateData,
        });

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

// DELETE — Delete user
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await verifyLeader();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Leader access required' }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deleting yourself
    if (id === session.user.id) {
        return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    try {
        // Delete user (cascading deletes will handle sessions, accounts, notifications)
        await prisma.user.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
