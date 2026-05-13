import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/tasks/[id]/full
// Returns the full task payload used by the Team Inbox detail modal.
// Same shape as /api/team-inbox so the modal can be opened from anywhere
// with just a task id (e.g. when deep-linked from a channel via ?task=<id>).
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const t = await prisma.task.findUnique({
        where: { id },
        include: {
            assignee: { select: { id: true, name: true, image: true } },
            assignedTeam: { select: { id: true, name: true } },
            targetChannel: { select: { id: true, name: true } },
        },
    });
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
        id: t.id,
        title: t.title,
        description: t.description,
        urgency: t.urgency,
        status: t.status,
        attachments: t.attachments,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        claimedAt: t.claimedAt,
        completedAt: t.completedAt,
        taskToken: t.taskToken,
        requesterName: t.requesterName,
        requesterEmail: t.requesterEmail,
        requesterDivision: t.requesterDivision,
        targetChannelId: t.targetChannelId,
        channelMessageId: t.channelMessageId,
        targetChannel: t.targetChannel,
        assignee: t.assignee,
        assignedTeam: t.assignedTeam,
    });
}
