/**
 * One-off: promote named users to role=admin. Lists all users afterwards.
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
  // Update admin@gmail.com to admin role
  const r1 = await prisma.user.updateMany({
    where: { email: 'admin@gmail.com' },
    data: { role: 'admin' }
  });
  console.log('Updated admin@gmail.com:', r1);

  // Also update alifmasyhur22@gmail.com to admin
  const r2 = await prisma.user.updateMany({
    where: { email: 'alifmasyhur22@gmail.com' },
    data: { role: 'admin' }
  });
  console.log('Updated alifmasyhur22@gmail.com:', r2);

  // List all users
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true }
  });
  console.log('\nAll users:');
  users.forEach(u => console.log(`  ${u.name} (${u.email}) - ${u.role}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
