import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/auth/pending - List users pending approval
export async function GET() {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pendingUsers = await prisma.user.findMany({
    where: { accountStatus: 'pending_approval' },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      team: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(pendingUsers);
}
