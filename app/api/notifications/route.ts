import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Fetch notifications for the current user
export async function GET() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifications = await prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
    });

    // Map to snake_case for frontend compatibility
    const data = notifications.map(n => ({
        id: n.id,
        user_id: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        data: n.data,
        created_at: n.createdAt.toISOString(),
    }));

    return NextResponse.json(data);
}

// PUT — Mark notifications as read.
// Body shape:
//   { markAllRead: true, type?: string }  — bulk mark; optional type narrows scope
//                                            (e.g. 'dm_message' to clear just DMs).
//   { id }                                — mark a single notification.
export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (body.markAllRead) {
        await prisma.notification.updateMany({
            where: {
                userId: session.user.id,
                read: false,
                ...(typeof body.type === 'string' && body.type ? { type: body.type } : {}),
            },
            data: { read: true },
        });
    } else if (body.id) {
        await prisma.notification.updateMany({
            where: { id: body.id, userId: session.user.id },
            data: { read: true },
        });
    }

    return NextResponse.json({ success: true });
}

// DELETE — Clear notifications. Optional ?type=<...> narrows the wipe to a
// single notification type so a user can clear DM noise without nuking task
// notifications.
export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const type = request.nextUrl.searchParams.get('type');

    await prisma.notification.deleteMany({
        where: {
            userId: session.user.id,
            ...(type ? { type } : {}),
        },
    });

    return NextResponse.json({ success: true });
}
