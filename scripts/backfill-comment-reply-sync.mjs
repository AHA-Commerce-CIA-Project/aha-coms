// One-shot backfill for Phase-2 comment <-> reply sync.
//
// For every Task with channelMessageId set (i.e. a Direct Assign card):
//   1. Walk its TaskComments. Any comment without mirrorReplyId gets a new
//      ThreadReply created on the source channel message, then linked back
//      via mirrorReplyId.
//   2. Walk the ThreadReplies on the same source message. Any reply that no
//      TaskComment is currently mirrored against gets a new TaskComment,
//      linked via the new comment's mirrorReplyId.
//
// Run with:
//   node --env-file=.env scripts/backfill-comment-reply-sync.mjs
//
// Idempotent — re-running skips already-linked rows.
//
// Reactions are not backfilled here. Going forward, new reactions on either
// side mirror live; historical reactions stay where they were created. If you
// want reaction parity for old data, run a separate one-off after this.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const tasks = await prisma.task.findMany({
        where: {
            channelMessageId: { not: null },
            targetChannelId: { not: null },
        },
        select: {
            id: true,
            channelMessageId: true,
            targetChannelId: true,
            requesterEmail: true,
        },
    });

    console.log(`Found ${tasks.length} Direct Assign card tasks to scan.`);

    let createdReplies = 0;
    let createdComments = 0;
    let alreadyLinked = 0;
    let skippedNoAuthor = 0;

    for (const task of tasks) {
        const messageId = task.channelMessageId;

        // 1. Comments → Replies
        const comments = await prisma.taskComment.findMany({
            where: { taskId: task.id },
            orderBy: { createdAt: 'asc' },
        });

        for (const c of comments) {
            if (c.mirrorReplyId) {
                alreadyLinked++;
                continue;
            }
            // Token-based requester comments have no authorUserId — ThreadReply
            // requires a senderId, so skip those (they remain task-only).
            if (!c.authorUserId) {
                skippedNoAuthor++;
                continue;
            }

            const reply = await prisma.threadReply.create({
                data: {
                    messageId,
                    senderId: c.authorUserId,
                    content: c.message,
                    attachments: c.attachments ?? [],
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                },
            });
            await prisma.$transaction([
                prisma.taskComment.update({
                    where: { id: c.id },
                    data: { mirrorReplyId: reply.id },
                }),
                prisma.channelMessage.update({
                    where: { id: messageId },
                    data: { replyCount: { increment: 1 } },
                }),
            ]);
            createdReplies++;
        }

        // 2. Replies → Comments
        // Anything we just created above already has the link, so the where
        // filter naturally excludes them.
        const replies = await prisma.threadReply.findMany({
            where: { messageId },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: { select: { id: true, name: true, email: true } },
            },
        });

        // Find which replies are already mirrored from a TaskComment.
        const linkedReplyIds = new Set(
            (await prisma.taskComment.findMany({
                where: { taskId: task.id, mirrorReplyId: { not: null } },
                select: { mirrorReplyId: true },
            })).map(c => c.mirrorReplyId)
        );

        for (const r of replies) {
            if (linkedReplyIds.has(r.id)) {
                alreadyLinked++;
                continue;
            }
            await prisma.taskComment.create({
                data: {
                    taskId: task.id,
                    authorUserId: r.senderId,
                    authorName: r.sender?.name || 'Team Member',
                    authorEmail: r.sender?.email || null,
                    message: r.content,
                    attachments: r.attachments ?? [],
                    mirrorReplyId: r.id,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                },
            });
            createdComments++;
        }
    }

    console.log('--- Backfill summary ---');
    console.log(`  Tasks scanned:            ${tasks.length}`);
    console.log(`  Already linked rows:      ${alreadyLinked}`);
    console.log(`  Token-author skipped:     ${skippedNoAuthor}`);
    console.log(`  ThreadReplies created:    ${createdReplies}`);
    console.log(`  TaskComments created:     ${createdComments}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
