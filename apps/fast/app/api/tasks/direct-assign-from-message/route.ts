import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';
import { sanitizeRichText, htmlToPlainText } from '@/lib/sanitize';

// POST — Convert an existing channel message into a Direct Assign task.
// Edits the source message in place to embed the `<!--direct_assign:TASK_ID-->`
// marker so the renderer flips it to a card. The task's channelMessageId points
// at that same message, giving us a hard link source-message ↔ task without a
// schema change.
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const {
        messageId,
        title,
        description,
        urgency,
        dueDate,
        attachments = [],
    } = body as {
        messageId?: string;
        title?: string;
        description?: string;
        urgency?: string;
        dueDate?: string | null;
        attachments?: Array<{ url: string; name: string; type: string; size: number; isImage: boolean }>;
    };

    if (!messageId) {
        return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }
    if (!title || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const sourceMessage = await prisma.channelMessage.findUnique({
        where: { id: messageId },
        select: {
            id: true,
            channelId: true,
            senderId: true,
            content: true,
            attachments: true,
            channel: {
                select: {
                    id: true,
                    name: true,
                    isPrivate: true,
                    createdBy: true,
                    purpose: true,
                    teamId: true,
                },
            },
        },
    });
    if (!sourceMessage || !sourceMessage.channel) {
        return NextResponse.json({ error: 'Source message not found' }, { status: 404 });
    }

    // Only the message author can convert their own message into a task.
    // This avoids one user hijacking another's message into an assignment.
    if (sourceMessage.senderId !== session.user.id) {
        return NextResponse.json({ error: 'Only the message author can convert it into a task' }, { status: 403 });
    }

    // Reject if the message is already a direct-assign card to avoid double-conversion.
    if (sourceMessage.content && sourceMessage.content.includes('<!--direct_assign:')) {
        return NextResponse.json({ error: 'This message is already a task card' }, { status: 400 });
    }

    const channel = sourceMessage.channel;
    if (channel.isPrivate) {
        const isMember = await prisma.channelMember.findUnique({
            where: { channelId_userId: { channelId: channel.id, userId: session.user.id } },
        }).catch(() => null);
        if (!isMember && channel.createdBy !== session.user.id) {
            return NextResponse.json({ error: 'You do not have access to this channel' }, { status: 403 });
        }
    }

    const requester = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, teamId: true, team: { select: { name: true } } },
    });

    const taskToken = crypto.randomBytes(4).toString('hex').toUpperCase();
    const normalizedUrgency = urgency || 'P3';
    const assignedTeamId: string | null = channel.teamId ?? null;

    if (channel.purpose === 'assign_task' && !assignedTeamId) {
        return NextResponse.json(
            { error: 'This channel has no owning team configured. Ask the channel creator to set one in channel settings.' },
            { status: 400 },
        );
    }

    const task = await prisma.task.create({
        data: {
            title: title.trim(),
            description: description ? sanitizeRichText(description) : null,
            requesterName: requester?.name || session.user.name || null,
            requesterEmail: requester?.email || session.user.email || null,
            requesterDivision: requester?.team?.name || null,
            urgency: normalizedUrgency,
            status: 'todo',
            source: 'direct_assign',
            targetChannelId: channel.id,
            assignedTeamId,
            taskToken,
            attachments: attachments as any,
            dueDate: dueDate ? new Date(dueDate) : null,
            channelMessageId: sourceMessage.id,
        },
        select: { id: true, taskToken: true, title: true },
    });

    // Edit the source message in place — same shape as direct-assign/route.ts
    // so the renderer can't tell the difference between a fresh card and a
    // converted one. Attachments stay on the task only (the card UI shows
    // them inside the detail modal, not in the message bubble).
    const plainDesc = description ? htmlToPlainText(description).slice(0, 240) : '';
    const cardContent = [
        `<!--direct_assign:${task.id}-->`,
        `📋 Task Request: ${task.title}`,
        `Priority: ${normalizedUrgency}`,
        plainDesc ? `\n${plainDesc}` : '',
    ].join('\n').trim();

    await prisma.channelMessage.update({
        where: { id: sourceMessage.id },
        data: {
            content: cardContent,
            attachments: [],
        },
    });

    await prisma.channel.update({
        where: { id: channel.id },
        data: { updatedAt: new Date() },
    });

    let targetIds: string[];
    if (channel.isPrivate) {
        const members = await prisma.channelMember.findMany({
            where: { channelId: channel.id },
            select: { userId: true },
        });
        const set = new Set(members.map(m => m.userId));
        if (channel.createdBy) set.add(channel.createdBy);
        set.delete(session.user.id);
        targetIds = Array.from(set);
    } else {
        const users = await prisma.user.findMany({
            where: { id: { not: session.user.id }, accountStatus: 'active' },
            select: { id: true },
        });
        targetIds = users.map(u => u.id);
    }

    if (targetIds.length > 0) {
        await prisma.notification.createMany({
            data: targetIds.map(uid => ({
                userId: uid,
                type: 'direct_assign_posted',
                title: `New task in #${channel.name}`,
                message: `${requester?.name || session.user.name || 'Someone'} converted a message to: "${task.title}" (${normalizedUrgency})`,
                data: {
                    task_id: task.id,
                    task_token: task.taskToken,
                    channel_id: channel.id,
                    message_id: sourceMessage.id,
                },
            })),
        });
    }

    logActivity(
        session.user.id,
        'task_direct_assigned',
        `${requester?.name || 'User'} converted a message in #${channel.name} to task "${task.title}"`,
        'task',
        task.id,
    );

    return NextResponse.json({
        success: true,
        taskId: task.id,
        taskToken: task.taskToken,
        messageId: sourceMessage.id,
        channelId: channel.id,
    }, { status: 201 });
}
