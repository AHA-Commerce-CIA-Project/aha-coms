import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://aha-fast-admin:${encodeURIComponent('***REMOVED-FU-19-DB-PW***')}@34.101.176.36:5432/aha-fast-db?schema=public`
    }
  }
});

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
