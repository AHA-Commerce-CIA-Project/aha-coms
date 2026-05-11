import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// POST — Claim a single checklist item on a TEAM-type routine task.
// Body (optional): { release: true } to drop a claim the caller already holds.
//
// Semantics:
//  - Only valid for tasks where Task.type === 'TEAM'. INDIVIDUAL tasks
//    expose a whole-task claim instead, so this route refuses them.
//  - First-write-wins: if the item is already claimed by someone else we
//    return 409 — the user should refresh and pick a different item.
//  - Release is allowed only by the current claimant.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, itemId } = await params;

  let body: { release?: boolean } = {};
  try { body = await request.json(); } catch { /* empty body — treat as claim */ }

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      taskId: true,
      assigneeId: true,
      isCompleted: true,
      task: { select: { id: true, type: true } },
    },
  });
  if (!item || item.taskId !== id) {
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
  }
  if (item.task.type !== 'TEAM') {
    return NextResponse.json(
      { error: 'Per-item claim only applies to TEAM-type tasks.' },
      { status: 400 },
    );
  }

  if (body.release) {
    if (item.assigneeId !== session.user.id) {
      return NextResponse.json({ error: 'Only the current claimer can release this item.' }, { status: 403 });
    }
    const updated = await prisma.checklistItem.update({
      where: { id: itemId },
      data: { assigneeId: null, claimedAt: null },
    });
    return NextResponse.json(updated);
  }

  if (item.assigneeId && item.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'Already claimed by another member.' }, { status: 409 });
  }

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data: { assigneeId: session.user.id, claimedAt: new Date() },
    include: { assignee: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json(updated);
}
