import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { sanitizeRichText } from '@/lib/sanitize';
import { logActivity } from '@/lib/activity-log';
import crypto from 'crypto';

// POST — Create a task from within a DM conversation
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: conversationId } = await params;
    const body = await request.json();
    const { title, description, urgency, dueDate, dueDateTime } = body;

    if (!title?.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Verify user is part of this conversation
    const participant = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: session.user.id },
    });
    if (!participant) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // Find the other participant (the assignee)
    const otherParticipant = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: { not: session.user.id } },
        include: { user: { select: { id: true, name: true } } },
    });
    if (!otherParticipant) {
        return NextResponse.json({ error: 'No other participant found' }, { status: 400 });
    }

    const caller = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true },
    });

    const taskToken = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Compute deadline
    let computedDueDate: Date | null = null;
    if (dueDate) {
        const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
        const selectedDate = new Date(dueDate);
        let hh: number, mm: number, ss: number;
        const m = dueDateTime && /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(dueDateTime);
        if (m) {
            hh = parseInt(m[1], 10);
            mm = parseInt(m[2], 10);
            ss = parseInt(m[3], 10);
        } else {
            // Default to end-of-day WIB so "today" isn't overdue the moment it's created
            hh = 23; mm = 59; ss = 59;
        }
        const deadlineWIB = Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate(), hh, mm, ss);
        computedDueDate = new Date(deadlineWIB - WIB_OFFSET_MS);
    }

    // Create task linked to conversation
    const task = await prisma.task.create({
        data: {
            title: title.trim(),
            description: sanitizeRichText(description),
            requesterName: caller?.name || 'Unknown',
            requesterEmail: caller?.email || null,
            requestType: 'dm_request',
            urgency: urgency || 'P3',
            status: 'todo',
            source: 'dm',
            assigneeId: otherParticipant.user.id,
            dueDate: computedDueDate,
            taskToken,
            conversationId,
            customFields: {},
        },
        select: { id: true, taskToken: true, title: true, status: true, urgency: true, dueDate: true, assigneeId: true },
    });

    // Insert task card message into the conversation
    await prisma.directMessage.create({
        data: {
            conversationId,
            senderId: session.user.id,
            content: '',
            type: 'task_card',
            taskId: task.id,
            taskSnapshot: {
                id: task.id,
                title: task.title,
                status: task.status,
                urgency: task.urgency,
                taskToken: task.taskToken,
                dueDate: task.dueDate?.toISOString() || null,
                assigneeName: otherParticipant.user.name,
                requesterName: caller?.name || 'Unknown',
            },
        },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    });

    // Notify assignee
    await prisma.notification.create({
        data: {
            userId: otherParticipant.user.id,
            type: 'task_assigned',
            title: 'New Task from DM',
            message: `${caller?.name} assigned you a task: "${task.title}"`,
            data: { task_id: task.id, task_token: task.taskToken, conversation_id: conversationId },
        },
    });

    logActivity(session.user.id, 'task_assigned', `${caller?.name} created task "${task.title}" for ${otherParticipant.user.name} via DM`, 'task', task.id);

    return NextResponse.json({ success: true, task }, { status: 201 });
}
