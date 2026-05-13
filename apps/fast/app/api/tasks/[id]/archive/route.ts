import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// PUT — Archive a task (Leader only)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify leader role
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'leader' && user?.role !== 'admin') {
        return NextResponse.json({ error: 'Leader access required' }, { status: 403 });
    }

    const { id } = await params;

    try {
        const task = await prisma.task.update({
            where: { id },
            data: { status: 'archived' },
        });

        return NextResponse.json({ success: true, task });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
