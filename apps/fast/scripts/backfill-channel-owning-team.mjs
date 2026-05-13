import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Backfill Channel.teamId for channels that already exist. Resolution order:
//   1. allowedTeamIds[0] when allowedTeamIds.length === 1 (unambiguous)
//   2. creator's teamId (best-guess fallback)
// Channels that can't be resolved are listed at the end so an admin can pick.
// Loose name match: strip a trailing "Teams"/"Team" word and any leading
// brackets, then look for a team whose name contains the remaining tokens.
function findTeamByChannelName(channelName, teams) {
  const cleaned = channelName
    .replace(/[\[\]]/g, ' ')
    .replace(/\bteams?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!cleaned) return null;

  // Exact (case-insensitive) match wins.
  const exact = teams.find((t) => t.name.toLowerCase() === cleaned);
  if (exact) return exact;

  // Substring fallback — channel "Marketplace Teams" → team "Marketplace".
  const matches = teams.filter((t) => {
    const n = t.name.toLowerCase();
    return n.includes(cleaned) || cleaned.includes(n);
  });
  return matches.length === 1 ? matches[0] : null;
}

async function main() {
  const [channels, allTeams] = await Promise.all([
    prisma.channel.findMany({
      where: { teamId: null },
      include: {
        creator: { select: { id: true, name: true, teamId: true } },
      },
    }),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ]);

  console.log(`Found ${channels.length} channels with no owning team.\n`);

  let resolvedSingle = 0;
  let resolvedCreator = 0;
  let resolvedByName = 0;
  const unresolved = [];

  for (const ch of channels) {
    let resolvedTeamId = null;
    let reason = '';

    if (ch.allowedTeamIds.length === 1) {
      resolvedTeamId = ch.allowedTeamIds[0];
      reason = `allowedTeamIds[0]`;
      resolvedSingle++;
    } else if (ch.creator?.teamId) {
      resolvedTeamId = ch.creator.teamId;
      reason = `creator's team (${ch.creator.name})`;
      resolvedCreator++;
    } else {
      const matched = findTeamByChannelName(ch.name, allTeams);
      if (matched) {
        resolvedTeamId = matched.id;
        reason = `name match → "${matched.name}"`;
        resolvedByName++;
      } else {
        unresolved.push(ch);
        continue;
      }
    }

    await prisma.channel.update({
      where: { id: ch.id },
      data: { teamId: resolvedTeamId },
    });
    console.log(`  ok    "${ch.name}" [${ch.purpose}] → ${resolvedTeamId} (${reason})`);
  }

  console.log(`\nResolved by allowedTeamIds[0]: ${resolvedSingle}`);
  console.log(`Resolved by creator's team:    ${resolvedCreator}`);
  console.log(`Resolved by channel name:      ${resolvedByName}`);
  console.log(`Unresolved:                    ${unresolved.length}`);

  if (unresolved.length > 0) {
    console.log('\nUnresolved channels — set teamId manually via channel settings:');
    for (const ch of unresolved) {
      console.log(`  - ${ch.id}  "${ch.name}"  purpose=${ch.purpose}  allowedTeamIds=[${ch.allowedTeamIds.join(', ')}]  creator=${ch.creator?.name || '?'}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
