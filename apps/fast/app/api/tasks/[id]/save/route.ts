import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// GET /api/tasks/[id]/save - Is this task saved by the current user?
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: taskId } = await params;
  const existing = await prisma.savedTask.findUnique({
    where: { userId_taskId: { userId: session.user.id, taskId } },
  });
  return NextResponse.json({ saved: !!existing });
}

// POST /api/tasks/[id]/save - Toggle save status for a task
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: taskId } = await params;

  const existing = await prisma.savedTask.findUnique({
    where: { userId_taskId: { userId: session.user.id, taskId } },
  });

  if (existing) {
    await prisma.savedTask.delete({ where: { id: existing.id } });
    return NextResponse.json({ action: 'unsaved' });
  }

  await prisma.savedTask.create({
    data: { userId: session.user.id, taskId },
  });
  return NextResponse.json({ action: 'saved' });
}
