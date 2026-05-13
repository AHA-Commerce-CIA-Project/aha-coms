import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

async function verifyLeader() {
    const session = await requireFastAuth();
    if (!session) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'leader' && user?.role !== 'admin') return null;
    return session;
}

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
        email_confirmed_at: u.accountStatus === 'active' ? u.createdAt.toISOString() : null,
        accountStatus: u.accountStatus,
    }));

    return NextResponse.json(data);
}

// POST — Disabled. User creation moved to portal-side identity
// management in the Spec 05 Phase 3 cascade (T63). Portal owns
// credential issuance via identity_users + identity_user_emails; fast
// upserts its own User row on first signed-in hit via loadFastAuthUser.
// The admin "create user" UI in fast surfaces this 410 directly so
// the operator knows where to go.
export async function POST(_request: NextRequest) {
    const session = await verifyAdmin();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized — Master access required' }, { status: 403 });
    }
    return NextResponse.json(
        {
            error: 'User creation moved to portal',
            detail: 'Create users via the portal admin surface; fast auto-provisions on the user\'s first signed-in hit.',
        },
        { status: 410 },
    );
}
