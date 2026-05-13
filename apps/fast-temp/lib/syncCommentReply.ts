// Phase-2 sync layer for Direct Assign cards: keeps a TaskComment and the
// matching ThreadReply on the source channel message in step. The 1:1 link
// lives on TaskComment.mirrorReplyId. Reactions piggyback on MessageReaction
// (already keyed by messageId/replyId) plus the new taskCommentId column.
//
// All helpers are best-effort and idempotent: any failure to mirror is logged
// and swallowed so the user-facing write that triggered the mirror still
// succeeds. Phase-2 explicitly accepts eventual-consistency drift over hard
// transactional coupling.

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

type Json = Prisma.InputJsonValue;

// Channels are visible to a user when:
//   - the channel is public AND visibleToAllTeams (or no team scoping), OR
//   - the user is an explicit member, OR
//   - the user created the channel, OR
//   - the user's team is in allowedTeamIds.
// We only mirror modal-comments INTO the channel when the commenter passes
// this check — otherwise we'd be leaking task-modal content into a channel
// they don't belong to.
export async function userCanPostToChannel(
    userId: string,
    channelId: string,
): Promise<boolean> {
    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: {
            isPrivate: true,
            createdBy: true,
            visibleToAllTeams: true,
            allowedTeamIds: true,
        },
    });
    if (!channel) return false;

    if (channel.createdBy === userId) return true;

    const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
    });
    if (member) return true;

    if (!channel.isPrivate) {
        if (channel.visibleToAllTeams) return true;
        if (channel.allowedTeamIds.length === 0) return true;
        const me = await prisma.user.findUnique({
            where: { id: userId },
            select: { teamId: true },
        });
        if (me?.teamId && channel.allowedTeamIds.includes(me.teamId)) return true;
    }

    return false;
}

// =================== CREATE MIRRORS ===================

// Called from POST /api/tasks/[id]/comments AFTER the comment row is created.
// If the task is a Direct Assign card AND the commenter is allowed in the
// source channel, we create a matching ThreadReply and stamp mirrorReplyId.
export async function mirrorCommentToReply(opts: {
    commentId: string;
    taskId: string;
    authorUserId: string | null;
    message: string;
    attachments: Json;
}): Promise<void> {
    try {
        const task = await prisma.task.findUnique({
            where: { id: opts.taskId },
            select: { channelMessageId: true, targetChannelId: true },
        });
        if (!task?.channelMessageId || !task.targetChannelId) return;

        // Token-based comments (requester replying via /track) have no
        // authorUserId — skip mirror, since ThreadReply.senderId is required.
        if (!opts.authorUserId) return;

        const allowed = await userCanPostToChannel(opts.authorUserId, task.targetChannelId);
        if (!allowed) return;

        const reply = await prisma.threadReply.create({
            data: {
                messageId: task.channelMessageId,
                senderId: opts.authorUserId,
                content: opts.message,
                attachments: opts.attachments,
            },
        });
        await prisma.$transaction([
            prisma.taskComment.update({
                where: { id: opts.commentId },
                data: { mirrorReplyId: reply.id },
            }),
            prisma.channelMessage.update({
                where: { id: task.channelMessageId },
                data: { replyCount: { increment: 1 } },
            }),
        ]);
    } catch (err) {
        console.error('[syncCommentReply] mirrorCommentToReply failed:', err);
    }
}

// Called from POST /api/channels/[channelId]/[messageId]/replies AFTER the
// reply row is created. If the parent message is a Direct Assign card, we
// create a matching TaskComment and link it via mirrorReplyId on the comment.
export async function mirrorReplyToComment(opts: {
    replyId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    senderEmail: string | null;
    content: string;
    attachments: Json;
}): Promise<void> {
    try {
        const message = await prisma.channelMessage.findUnique({
            where: { id: opts.messageId },
            select: {
                directAssignTasks: {
                    select: { id: true },
                    take: 1,
                },
            },
        });
        const task = message?.directAssignTasks[0];
        if (!task) return;

        const comment = await prisma.taskComment.create({
            data: {
                taskId: task.id,
                authorUserId: opts.senderId,
                authorName: opts.senderName,
                authorEmail: opts.senderEmail,
                message: opts.content,
                attachments: opts.attachments,
                mirrorReplyId: opts.replyId,
            },
        });
        return void comment.id;
    } catch (err) {
        console.error('[syncCommentReply] mirrorReplyToComment failed:', err);
    }
}

// =================== EDIT MIRRORS ===================

export async function mirrorCommentEdit(opts: {
    commentId: string;
    message: string;
    attachments?: Json;
}): Promise<void> {
    try {
        const comment = await prisma.taskComment.findUnique({
            where: { id: opts.commentId },
            select: { mirrorReplyId: true },
        });
        if (!comment?.mirrorReplyId) return;

        await prisma.threadReply.update({
            where: { id: comment.mirrorReplyId },
            data: {
                content: opts.message,
                ...(opts.attachments !== undefined ? { attachments: opts.attachments } : {}),
            },
        });
    } catch (err) {
        console.error('[syncCommentReply] mirrorCommentEdit failed:', err);
    }
}

export async function mirrorReplyEdit(opts: {
    replyId: string;
    content: string;
    attachments?: Json;
}): Promise<void> {
    try {
        const comment = await prisma.taskComment.findFirst({
            where: { mirrorReplyId: opts.replyId },
            select: { id: true },
        });
        if (!comment) return;

        await prisma.taskComment.update({
            where: { id: comment.id },
            data: {
                message: opts.content,
                ...(opts.attachments !== undefined ? { attachments: opts.attachments } : {}),
            },
        });
    } catch (err) {
        console.error('[syncCommentReply] mirrorReplyEdit failed:', err);
    }
}

// =================== DELETE MIRRORS ===================

export async function mirrorCommentDelete(opts: {
    mirrorReplyId: string | null;
    messageId: string | null;
}): Promise<void> {
    if (!opts.mirrorReplyId) return;
    try {
        // Decrement replyCount only if the reply still exists; the delete +
        // count update happen in one transaction so we can't drift.
        const exists = await prisma.threadReply.findUnique({
            where: { id: opts.mirrorReplyId },
            select: { id: true, messageId: true },
        });
        if (!exists) return;

        await prisma.$transaction([
            prisma.threadReply.delete({ where: { id: exists.id } }),
            prisma.channelMessage.update({
                where: { id: exists.messageId },
                data: { replyCount: { decrement: 1 } },
            }),
        ]);
    } catch (err) {
        console.error('[syncCommentReply] mirrorCommentDelete failed:', err);
    }
}

export async function mirrorReplyDelete(opts: { replyId: string }): Promise<void> {
    try {
        const comment = await prisma.taskComment.findFirst({
            where: { mirrorReplyId: opts.replyId },
            select: { id: true },
        });
        if (!comment) return;
        await prisma.taskComment.delete({ where: { id: comment.id } });
    } catch (err) {
        console.error('[syncCommentReply] mirrorReplyDelete failed:', err);
    }
}

// =================== REACTION MIRRORS ===================

// When a user toggles a reaction on a TaskComment, we mirror it to the linked
// ThreadReply (if any) so the same emoji+user combo appears on both sides.
export async function mirrorReactionFromComment(opts: {
    userId: string;
    emoji: string;
    taskCommentId: string;
    action: 'added' | 'removed';
}): Promise<void> {
    try {
        const comment = await prisma.taskComment.findUnique({
            where: { id: opts.taskCommentId },
            select: { mirrorReplyId: true },
        });
        if (!comment?.mirrorReplyId) return;

        if (opts.action === 'added') {
            // Idempotent: skip if already mirrored.
            const existing = await prisma.messageReaction.findFirst({
                where: { userId: opts.userId, emoji: opts.emoji, replyId: comment.mirrorReplyId },
                select: { id: true },
            });
            if (existing) return;
            await prisma.messageReaction.create({
                data: { userId: opts.userId, emoji: opts.emoji, replyId: comment.mirrorReplyId },
            });
        } else {
            await prisma.messageReaction.deleteMany({
                where: { userId: opts.userId, emoji: opts.emoji, replyId: comment.mirrorReplyId },
            });
        }
    } catch (err) {
        console.error('[syncCommentReply] mirrorReactionFromComment failed:', err);
    }
}

// When a user toggles a reaction on a ThreadReply, mirror to the linked
// TaskComment. Only fires for replies that have a comment mirror — message-
// level reactions and unmirrored replies are unaffected.
export async function mirrorReactionFromReply(opts: {
    userId: string;
    emoji: string;
    replyId: string;
    action: 'added' | 'removed';
}): Promise<void> {
    try {
        const comment = await prisma.taskComment.findFirst({
            where: { mirrorReplyId: opts.replyId },
            select: { id: true },
        });
        if (!comment) return;

        if (opts.action === 'added') {
            const existing = await prisma.messageReaction.findFirst({
                where: { userId: opts.userId, emoji: opts.emoji, taskCommentId: comment.id },
                select: { id: true },
            });
            if (existing) return;
            await prisma.messageReaction.create({
                data: { userId: opts.userId, emoji: opts.emoji, taskCommentId: comment.id },
            });
        } else {
            await prisma.messageReaction.deleteMany({
                where: { userId: opts.userId, emoji: opts.emoji, taskCommentId: comment.id },
            });
        }
    } catch (err) {
        console.error('[syncCommentReply] mirrorReactionFromReply failed:', err);
    }
}
