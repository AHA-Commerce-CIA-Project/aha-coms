import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { name, description, frequency, category, deadlineTime, deadlineDay, teamId, teamIds, isTeamWide } = await request.json();

  const template = await prisma.routineTaskTemplate.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(frequency ? { frequency } : {}),
      ...(category !== undefined ? { category: category?.trim() || null } : {}),
      ...(deadlineTime !== undefined ? { deadlineTime: deadlineTime || null } : {}),
      ...(deadlineDay !== undefined ? { deadlineDay: deadlineDay ? parseInt(deadlineDay) : null } : {}),
      ...(teamIds !== undefined ? { teamIds, teamId: teamIds.length > 0 ? teamIds[0] : null } : teamId !== undefined ? { teamId: teamId || null } : {}),
      ...(isTeamWide !== undefined ? { isTeamWide: !!isTeamWide } : {}),
    },
    include: {
      creator: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(template);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  await prisma.routineTaskTemplate.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
