/**
 * Destructive: clears team assignments + teams table, then reseeds canonical
 * team list. Reads DATABASE_URL from process.env. Operator runbook lives in
 * add-teams.ts's header — the same shape applies here.
 */
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set in the environment before running this script.');
  process.exit(1);
}

const prisma = new PrismaClient();

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
