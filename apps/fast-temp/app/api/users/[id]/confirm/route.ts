import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { logActivity } from '@/lib/activity-log';

// POST — Confirm a user's email (Leader only)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify leader role
    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (currentUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized — Leader access required' }, { status: 403 });
    }

    const { id } = await params;

    try {
        const user = await prisma.user.update({
            where: { id },
            data: { emailVerified: true },
        });

        logActivity(
            session.user.id,
            'user_confirmed',
            `${session.user.name} confirmed email for ${user.name} (${user.email})`,
            'user',
            id,
        );

        return NextResponse.json({
            success: true,
            email_confirmed_at: user.updatedAt.toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
