import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const channels = await prisma.channel.findMany({
    where: { allowedTeamIds: { isEmpty: true } },
    include: { creator: { select: { teamId: true, name: true } } },
  });

  console.log(`Found ${channels.length} channels with empty allowedTeamIds.`);

  let updated = 0;
  let skipped = 0;
  for (const ch of channels) {
    const tid = ch.creator?.teamId;
    if (!tid) {
      console.log(`  skip  "${ch.name}" — creator ${ch.creator?.name || '?'} has no team`);
      skipped++;
      continue;
    }
    await prisma.channel.update({
      where: { id: ch.id },
      data: { allowedTeamIds: [tid] },
    });
    console.log(`  ok    "${ch.name}" → [${tid}] (creator: ${ch.creator?.name})`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
