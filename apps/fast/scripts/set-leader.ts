/**
 * One-off: promote named users to role=leader. Lists all users afterwards.
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
  // Update admin@gmail.com and alifmasyhur22@gmail.com roles to 'leader'
  const r1 = await prisma.user.updateMany({
    where: { email: { in: ['admin@gmail.com', 'alifmasyhur22@gmail.com'] } },
    data: { role: 'leader' }
  });
  console.log('Updated users to leader:', r1);

  // List all users
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true }
  });
  console.log('\nAll users:');
  users.forEach(u => console.log(`  ${u.name} (${u.email}) - ${u.role}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
