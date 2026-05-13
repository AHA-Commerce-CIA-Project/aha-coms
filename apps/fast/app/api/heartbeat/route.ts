import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

const HEARTBEAT_SECONDS = 30;

// POST — Update user's lastSeenAt and accumulate active seconds for today (WIB)
export async function POST() {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    // Compute today's date in WIB (UTC+7)
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    const todayWIB = new Date(Date.UTC(
        nowWIB.getUTCFullYear(),
        nowWIB.getUTCMonth(),
        nowWIB.getUTCDate(),
    ));

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { activeDate: true, activeSecondsToday: true },
    });

    const sameDay = user?.activeDate &&
        new Date(user.activeDate).getTime() === todayWIB.getTime();

    await prisma.user.update({
        where: { id: session.user.id },
        data: {
            lastSeenAt: new Date(),
            activeDate: todayWIB,
            activeSecondsToday: sameDay
                ? { increment: HEARTBEAT_SECONDS }
                : HEARTBEAT_SECONDS,
            totalActiveSeconds: { increment: HEARTBEAT_SECONDS },
        },
    });

    // Daily snapshot — used for "This Week" / "This Month" analytics. Increment
    // the row for (userId, todayWIB) in lockstep with activeSecondsToday.
    await prisma.userActivityDaily.upsert({
        where: { userId_date: { userId: session.user.id, date: todayWIB } },
        create: { userId: session.user.id, date: todayWIB, activeSeconds: HEARTBEAT_SECONDS },
        update: { activeSeconds: { increment: HEARTBEAT_SECONDS } },
    });

    return NextResponse.json({ ok: true });
}
