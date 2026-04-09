import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels - List channels visible to current user
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Public channels + private channels where user is a member or creator
  const channels = await prisma.channel.findMany({
    where: {
      isArchived: false,
      OR: [
        { isPrivate: false },
        { isPrivate: true, createdBy: userId },
        { isPrivate: true, members: { some: { userId } } },
      ],
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { messages: true, members: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // For public channels, get total user count; for private, use member count + creator
  const totalUsers = await prisma.user.count();
  const result = channels.map((ch) => ({
    ...ch,
    memberCount: ch.isPrivate ? ch._count.members + 1 : totalUsers,
  }));

  return NextResponse.json(result);
}

// POST /api/channels - Create channel (leader/admin only)
export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description, isPrivate = false, memberIds = [] } = await request.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  }

  const channel = await prisma.channel.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      createdBy: session.user.id,
      isPrivate,
      ...(isPrivate && memberIds.length > 0
        ? {
            members: {
              create: memberIds.map((userId: string) => ({ userId })),
            },
          }
        : {}),
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
