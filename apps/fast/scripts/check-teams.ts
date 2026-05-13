/**
 * Read-only inspection: lists teams; seeds defaults if table is empty.
 *
 * Reads DATABASE_URL from process.env. Operator runbook lives in
 * add-teams.ts's header — the same shape applies here.
 */
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set in the environment before running this script.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany();
  console.log('Current Teams in DB:', teams);
  
  if (teams.length === 0) {
      console.log('Inserting default teams...');
      await prisma.team.createMany({
          data: [
              { name: 'Digital Marketing' },
              { name: 'Operation' },
              { name: 'Developer' },
              { name: 'Design' },
              { name: 'Video Editor' }
          ]
      });
      const newTeams = await prisma.team.findMany();
      console.log('New Teams in DB:', newTeams);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
