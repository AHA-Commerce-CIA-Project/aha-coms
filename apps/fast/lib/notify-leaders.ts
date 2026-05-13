import { prisma } from '@/lib/db';

/**
 * Send a notification to all users with 'leader' role.
 */
export async function notifyLeaders(
    type: 'task_assigned' | 'task_updated' | 'reminder' | 'mention',
    title: string,
    message: string,
    data?: Record<string, any>
) {
    const leaders = await prisma.user.findMany({
        where: { role: 'leader' },
        select: { id: true },
    });

    if (!leaders.length) return;

    await prisma.notification.createMany({
        data: leaders.map(leader => ({
            userId: leader.id,
            type,
            title,
            message,
            read: false,
            data: data ?? undefined,
        })),
    });
}

/**
 * Send a notification to ALL users (both 'leader' and 'member' roles).
 */
export async function notifyAllUsers(
    type: 'task_assigned' | 'task_updated' | 'reminder' | 'mention',
    title: string,
    message: string,
    data?: Record<string, any>
) {
    const users = await prisma.user.findMany({
        select: { id: true },
    });

    if (!users.length) return;

    await prisma.notification.createMany({
        data: users.map(user => ({
            userId: user.id,
            type,
            title,
            message,
            read: false,
            data: data ?? undefined,
        })),
    });
}
