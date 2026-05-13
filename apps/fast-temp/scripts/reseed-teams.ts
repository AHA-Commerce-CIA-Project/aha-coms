import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://aha-fast-admin:${encodeURIComponent('***REMOVED-FU-19-DB-PW***')}@34.101.176.36:5432/aha-fast-db?schema=public`
    }
  }
});

async function main() {
  console.log('Resetting user team assignments...');
  await prisma.user.updateMany({
      data: { teamId: null }
  });

  console.log('Clearing old teams...');
  await prisma.team.deleteMany();

  const specificTeams = [
      'Factual Business Intelligence (FBI)',
      'Partner Relationship (PR)',
      'Marketplace (MP)',
      'Branding',
      'Finance',
      'Business Development (BD)',
      'Warehouse',
      'Human Resource (HR)',
      'Customer Service (CS)',
      'Logistics'
  ];

  console.log('Inserting correct teams...');
  await prisma.team.createMany({
      data: specificTeams.map(name => ({ name }))
  });

  const newTeams = await prisma.team.findMany();
  console.log('New Teams in DB:');
  newTeams.forEach(t => console.log(`- ${t.name}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
