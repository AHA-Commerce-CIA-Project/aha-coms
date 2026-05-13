import { prisma } from '@/lib/db';

export async function logActivity(
  userId: string,
  action: string,
  description: string,
  entityType?: string,
  entityId?: string,
  metadata?: any,
) {
  try {
    // For system-level events (no real user), find a leader to attribute to
    let resolvedUserId = userId;
    if (userId === 'system') {
      const leader = await prisma.user.findFirst({
        where: { role: { in: ['leader', 'admin'] } },
        select: { id: true },
      });
      if (!leader) return; // No leader to attribute to
      resolvedUserId = leader.id;
    }

    await prisma.activityLog.create({
      data: {
        userId: resolvedUserId,
        action,
        description,
        entityType: entityType || null,
        entityId: entityId || null,
        metadata: metadata || null,
      },
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
