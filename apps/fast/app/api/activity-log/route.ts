import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/activity-log - List activity logs (leader only)
export async function GET(request: Request) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
  const limit = Math.min(parseInt(searchParams.get('limit') || '15'), 100);
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const search = searchParams.get('search');

  const where: any = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (search) where.description = { contains: search, mode: 'insensitive' };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, image: true, role: true } },
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
