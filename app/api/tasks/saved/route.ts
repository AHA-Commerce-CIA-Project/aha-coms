import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/tasks/saved - List current user's saved tasks
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const saved = await prisma.savedTask.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      task: {
        include: {
          assignee: { select: { id: true, name: true, image: true } },
          directAssignee: { select: { id: true, name: true } },
        },
      },
    },
  });

  const data = saved.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    task: s.task
      ? {
          id: s.task.id,
          title: s.task.title,
          description: s.task.description,
          status: s.task.status,
          urgency: s.task.urgency,
          priority: s.task.priority,
          source: s.task.source,
          task_token: s.task.taskToken,
          requester_name: s.task.requesterName,
          requester_division: s.task.requesterDivision,
          request_type: s.task.requestType,
          due_date: s.task.dueDate?.toISOString() || null,
          created_at: s.task.createdAt.toISOString(),
          claimed_at: s.task.claimedAt?.toISOString() || null,
          completed_at: s.task.completedAt?.toISOString() || null,
          assignee_name: s.task.assignee?.name || null,
          direct_assignee_name: s.task.directAssignee?.name || null,
          // direct_assign tasks live in their source channel — these let
          // /later route Open task straight to the channel + open the
          // task detail modal, instead of bouncing to /nexus which
          // doesn't list direct_assign tasks.
          target_channel_id: s.task.targetChannelId,
          channel_message_id: s.task.channelMessageId,
        }
      : null,
  }));

  return NextResponse.json(data);
}
