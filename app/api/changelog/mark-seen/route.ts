import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// POST — mark current time as user's last-seen changelog timestamp
export async function POST() {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastChangelogSeenAt: new Date() },
    });

    return NextResponse.json({ ok: true });
}
