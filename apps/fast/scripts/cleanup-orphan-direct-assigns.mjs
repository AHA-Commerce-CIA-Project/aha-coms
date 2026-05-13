// One-time cleanup: delete direct_assign tasks whose source channel message
// is gone. Before we changed Task.channelMessage to onDelete: Cascade, the
// FK was SetNull, so prior message deletions left dead cards in the team
// inbox with channelMessageId = null.
//
// Run with: node scripts/cleanup-orphan-direct-assigns.mjs
//
// Idempotent — running it again is a no-op once orphans are gone.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Direct-assign tasks are the ones that should always have a backing
    // channel message. Other sources (request form, routine, etc.) legitimately
    // have channelMessageId = null and we leave those alone.
    const orphans = await prisma.task.findMany({
        where: { source: 'direct_assign', channelMessageId: null },
        select: { id: true, title: true, taskToken: true, status: true, createdAt: true },
    });

    if (orphans.length === 0) {
        console.log('No orphaned direct-assign tasks. Database is clean.');
        return;
    }

    console.log(`Found ${orphans.length} orphaned direct-assign task(s):`);
    for (const t of orphans) {
        console.log(`  - ${t.id}  token=${t.taskToken}  status=${t.status}  created=${t.createdAt.toISOString()}  title="${t.title}"`);
    }

    const result = await prisma.task.deleteMany({
        where: { source: 'direct_assign', channelMessageId: null },
    });
    console.log(`Deleted ${result.count} orphaned task(s).`);
}

main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
