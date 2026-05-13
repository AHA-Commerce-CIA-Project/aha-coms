import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';

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

async function verifyAdmin() {
    const session = await requireAuth();
    if (!session) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'admin') return null;
    return session;
}

// GET — Fetch all users
export async function GET() {
    const session = await verifyLeader();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Leader access required' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
        include: {
            team: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Map to the old format expected by the frontend
    const data = users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        avatar_url: u.image,
        role: u.role,
        team_id: u.teamId,
        created_at: u.createdAt.toISOString(),
        teams: u.team ? { name: u.team.name } : null,
        email_confirmed_at: u.emailVerified ? u.createdAt.toISOString() : null,
        accountStatus: u.accountStatus,
    }));

    return NextResponse.json(data);
}

// POST — Create a new user (Master/Admin only)
export async function POST(request: NextRequest) {
    const session = await verifyAdmin();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Master access required' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, name, role, team_id } = body;

    if (!email || !password || !name) {
        return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    if (!email.toLowerCase().endsWith('@ahacommerce.net')) {
        return NextResponse.json({ error: 'Only @ahacommerce.net email addresses are allowed.' }, { status: 400 });
    }

    try {
        // Use Better Auth to create the user with email/password
        const ctx = await auth.api.signUpEmail({
            body: {
                email,
                password,
                name,
            },
        });

        if (!ctx?.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        // Update role and team
        const updatedUser = await prisma.user.update({
            where: { id: ctx.user.id },
            data: {
                role: role || 'member',
                teamId: team_id || null,
                emailVerified: true,
            },
        });

        const roleLabel = (r: string) => r === 'admin' ? 'Master' : r === 'leader' ? 'Leader' : 'Member';
        logActivity(
            session.user.id,
            'user_created',
            `${session.user.name} created new account: ${name} (${email}) as ${roleLabel(updatedUser.role)}`,
            'user',
            updatedUser.id,
        );

        return NextResponse.json({
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            role: updatedUser.role,
            team_id: updatedUser.teamId,
            created_at: updatedUser.createdAt.toISOString(),
        }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 400 });
    }
}
