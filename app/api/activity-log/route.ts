import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/activity-log - List activity logs (leader only)
export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const search = searchParams.get('search');

  const where: any = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (search) where.description = { contains: search, mode: 'insensitive' };

  const logs = await prisma.activityLog.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, image: true, role: true } },
    },
  });

  const hasMore = logs.length > limit;
  if (hasMore) logs.pop();

  return NextResponse.json({
    logs,
    nextCursor: hasMore ? logs[logs.length - 1].id : null,
  });
}
