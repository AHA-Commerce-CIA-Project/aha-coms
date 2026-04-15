import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// POST — Update user's lastSeenAt timestamp (called every 30s by client)
export async function POST() {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({ ok: true });
}
