import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const templates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true },
    include: {
      creator: { select: { id: true, name: true } },
    },
    orderBy: [{ frequency: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only leaders can create routine tasks' }, { status: 403 });
  }

  const { name, description, frequency, category, deadlineTime, deadlineDay } = await request.json();

  if (!name?.trim() || !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return NextResponse.json({ error: 'Name and valid frequency required' }, { status: 400 });
  }

  const template = await prisma.routineTaskTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      frequency,
      category: category?.trim() || null,
      deadlineTime: deadlineTime || null,
      deadlineDay: deadlineDay ? parseInt(deadlineDay) : null,
      createdBy: session.user.id,
    },
    include: { creator: { select: { id: true, name: true } } },
  });

  return NextResponse.json(template, { status: 201 });
}
