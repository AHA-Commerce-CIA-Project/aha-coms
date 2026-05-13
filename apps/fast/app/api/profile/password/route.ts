import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { logActivity } from '@/lib/activity-log';

// POST /api/profile/password - Change password
export async function POST(request: Request) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
    }

    try {
        // Use better-auth's changePassword API
        const result = await auth.api.changePassword({
            body: {
                currentPassword,
                newPassword,
            },
            headers: await headers(),
        });

        logActivity(session.user.id, 'password_changed', `${session.user.name} changed their password`, 'user', session.user.id);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message || 'Failed to change password. Check your current password.' },
            { status: 400 }
        );
    }
}
