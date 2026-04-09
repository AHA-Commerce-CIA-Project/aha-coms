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

// PUT — Mark notifications as read
export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (body.markAllRead) {
        await prisma.notification.updateMany({
            where: { userId: session.user.id, read: false },
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

// DELETE — Clear all notifications
export async function DELETE() {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.notification.deleteMany({
        where: { userId: session.user.id },
    });

    return NextResponse.json({ success: true });
}
