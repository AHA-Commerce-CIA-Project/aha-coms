import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/channels/saved - List saved messages and replies
export async function GET() {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const saved = await prisma.savedMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      message: {
        include: {
          sender: { select: { id: true, name: true, image: true } },
          channel: { select: { id: true, name: true } },
        },
      },
      reply: {
        include: {
          sender: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  return NextResponse.json(saved);
}
