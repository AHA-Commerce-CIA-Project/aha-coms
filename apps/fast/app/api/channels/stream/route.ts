import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// SSE endpoint: streams new channel messages + unread counts in real time.
// Client opens ONE EventSource per session; server checks DB every 500ms.
export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return new Response('Unauthorized', { status: 401 });
    }

    const channelId = request.nextUrl.searchParams.get('channelId');
    const userId = session.user.id;

    const encoder = new TextEncoder();
    let alive = true;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: any) => {
                if (!alive) return;
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                } catch {
                    alive = false;
                }
            };

            // Send initial heartbeat so connection is established
            send('connected', { ts: Date.now() });

            let lastMessageCheck = new Date();
            let lastUnreadCheck = new Date(0);

            const check = async () => {
                if (!alive) return;

                try {
                    // 1. New messages for the active channel
                    if (channelId) {
                        const newMessages = await prisma.channelMessage.findMany({
                            where: {
                                channelId,
                                createdAt: { gt: lastMessageCheck },
                            },
                            include: {
                                sender: { select: { id: true, name: true, image: true } },
                                reactions: true,
                                savedBy: { where: { userId }, select: { id: true } },
                            },
                            orderBy: { createdAt: 'asc' },
                        });

                        if (newMessages.length > 0) {
                            send('messages', newMessages);
                            lastMessageCheck = newMessages[newMessages.length - 1].createdAt;
                        }
                    }

                    // 2. Unread counts (check less frequently — every 2.5s)
                    const now = new Date();
                    if (now.getTime() - lastUnreadCheck.getTime() > 2500) {
                        lastUnreadCheck = now;
                        const readStatuses = await prisma.channelReadStatus.findMany({
                            where: { userId },
                            select: { channelId: true, lastReadAt: true },
                        });
                        const readMap = new Map(readStatuses.map(r => [r.channelId, r.lastReadAt]));

                        const channels = await prisma.channel.findMany({
                            where: {
                                OR: [
                                    { isPrivate: false },
                                    { members: { some: { userId } } },
                                    { createdBy: userId },
                                ],
                            },
                            select: { id: true, updatedAt: true },
                        });

                        let totalUnread = 0;
                        const channelUpdates: { id: string; hasNew: boolean }[] = [];
                        for (const ch of channels) {
                            const lastRead = readMap.get(ch.id);
                            const hasNew = !lastRead || ch.updatedAt > lastRead;
                            if (hasNew) totalUnread++;
                            channelUpdates.push({ id: ch.id, hasNew });
                        }

                        send('unread', { totalUnread, channels: channelUpdates });
                    }
                } catch {
                    // DB error — skip this tick
                }
            };

            // Check every 500ms — lightweight indexed queries
            const interval = setInterval(check, 500);

            // Clean up when client disconnects
            request.signal.addEventListener('abort', () => {
                alive = false;
                clearInterval(interval);
                try { controller.close(); } catch {}
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
