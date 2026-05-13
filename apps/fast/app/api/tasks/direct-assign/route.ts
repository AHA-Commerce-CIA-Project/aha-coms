import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';
import { sanitizeRichText, htmlToPlainText } from '@/lib/sanitize';

// POST — Direct Assign. Creates a task targeted at a team channel and posts
// a special "direct_assign" card into that channel so any channel member can claim.
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
        channelId,
        title,
        description,
        urgency,
        dueDate,
        attachments = [],
        assignedTeamId: bodyAssignedTeamId,
    } = body as {
        channelId?: string;
        title?: string;
        description?: string;
        urgency?: string;
        dueDate?: string | null;
        attachments?: Array<{ url: string; name: string; type: string; size: number; isImage: boolean }>;
        assignedTeamId?: string | null;
    };

    if (!channelId) {
        return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!title || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Verify the channel exists and the requester can post to it.
    // Rules mirror channel message posting: public channels are open; private requires membership or being the creator.
    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: {
            id: true,
            name: true,
            isPrivate: true,
            createdBy: true,
            allowedTeamIds: true,
            visibleToAllTeams: true,
            purpose: true,
            teamId: true,
        },
    });
    if (!channel) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    if (channel.isPrivate) {
        const isMember = await prisma.channelMember.findUnique({
            where: { channelId_userId: { channelId, userId: session.user.id } },
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

    // Owning team is the channel's declared team — the single source of truth
    // for Team Inbox routing. Body override allowed for legacy callers but
    // assign_task channels must have channel.teamId set.
    const assignedTeamId: string | null = bodyAssignedTeamId ?? channel.teamId ?? null;
    if (channel.purpose === 'assign_task' && !assignedTeamId) {
        return NextResponse.json(
            { error: 'This channel has no owning team configured. Ask the channel creator to set one in channel settings.' },
            { status: 400 },
        );
    }

    // Create the task first so we can embed its id in the channel card.
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
            targetChannelId: channelId,
            assignedTeamId,
            taskToken,
            attachments: attachments as any,
            dueDate: dueDate ? new Date(dueDate) : null,
        },
        select: { id: true, taskToken: true, title: true },
    });

    // Post a marker-carrying message into the channel. The card is identified by
    // `<!--direct_assign:TASK_ID-->` — the renderer picks it up and swaps it for the card UI.
    const plainDesc = description ? htmlToPlainText(description).slice(0, 240) : '';
    const cardContent = [
        `<!--direct_assign:${task.id}-->`,
        `📋 Task Request: ${task.title}`,
        `Priority: ${normalizedUrgency}`,
        plainDesc ? `\n${plainDesc}` : '',
    ].join('\n').trim();

    // Attachments live on the task only — the channel message just carries the
    // card marker. Otherwise the same images/files render twice (once outside
    // the card in the message bubble, once inside the detail modal).
    const message = await prisma.channelMessage.create({
        data: {
            channelId,
            senderId: session.user.id,
            content: cardContent,
            attachments: [],
            mentions: [],
        },
        select: { id: true },
    });

    // Link message back to task.
    await prisma.task.update({
        where: { id: task.id },
        data: { channelMessageId: message.id },
    });

    // Bump channel updatedAt so the channel list reorders.
    await prisma.channel.update({
        where: { id: channelId },
        data: { updatedAt: new Date() },
    });

    // Notify channel audience. Private → members + creator; public → all users.
    let targetIds: string[];
    if (channel.isPrivate) {
        const members = await prisma.channelMember.findMany({
            where: { channelId },
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
                message: `${requester?.name || session.user.name || 'Someone'} posted: "${task.title}" (${normalizedUrgency})`,
                data: {
                    task_id: task.id,
                    task_token: task.taskToken,
                    channel_id: channelId,
                    message_id: message.id,
                },
            })),
        });
    }

    logActivity(
        session.user.id,
        'task_direct_assigned',
        `${requester?.name || 'User'} posted "${task.title}" to #${channel.name}`,
        'task',
        task.id,
    );

    return NextResponse.json({
        success: true,
        taskId: task.id,
        taskToken: task.taskToken,
        messageId: message.id,
    }, { status: 201 });
}
