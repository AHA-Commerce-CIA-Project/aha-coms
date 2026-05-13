import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://aha-fast-admin:${encodeURIComponent('***REMOVED-FU-19-DB-PW***')}@34.101.176.36:5432/aha-fast-db?schema=public`
    }
  }
});

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
