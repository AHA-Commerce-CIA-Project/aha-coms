import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// POST — mark current time as user's last-seen changelog timestamp
export async function POST() {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastChangelogSeenAt: new Date() },
    });

    return NextResponse.json({ ok: true });
}
