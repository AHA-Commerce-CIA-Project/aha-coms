import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://aha-fast-admin:${encodeURIComponent('***REMOVED-FU-19-DB-PW***')}@34.101.176.36:5432/aha-fast-db?schema=public`
    }
  }
});

async function main() {
  const newTeams = [
    'Human Resource (HR)',
    'Customer Service (CS)',
    'Logistics'
  ];

  console.log('Inserting new teams...');
  for (const name of newTeams) {
      const existing = await prisma.team.findFirst({ where: { name } });
      if (!existing) {
          await prisma.team.create({ data: { name } });
      }
  }

  const allTeams = await prisma.team.findMany();
  console.log('All Teams in DB:');
  allTeams.forEach(t => console.log(`- ${t.name}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
