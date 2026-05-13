/**
 * One-off seed: insert HR, CS, Logistics into fast's Team table.
 *
 * Reads DATABASE_URL from process.env (mirroring backfill-portal-sub.ts).
 * The operator opens a Cloud SQL Auth Proxy (or points directly at the fast
 * instance's public IP) and exports DATABASE_URL before invoking:
 *
 *   export DATABASE_URL='postgres://aha-fast-admin:<pw>@<host>:5432/aha-fast-db'
 *   bun run apps/fast/scripts/add-teams.ts
 *
 * The password lives in Secret Manager (`aha-fast-db-url`); fetch via
 * `gcloud secrets versions access latest --secret=aha-fast-db-url` or
 * read it out of `infra/fast/` once T80 authors that surface.
 */
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set in the environment before running this script.');
  console.error('See the file header for the operator runbook.');
  process.exit(1);
}

const prisma = new PrismaClient();

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
