import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://aha-fast-admin:${encodeURIComponent('***REMOVED-FU-19-DB-PW***')}@34.101.176.36:5432/aha-fast-db?schema=public`
    }
  }
});

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
