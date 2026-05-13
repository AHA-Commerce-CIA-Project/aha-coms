import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// SSE endpoint for real-time DM updates
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const conversationId = request.nextUrl.searchParams.get('conversationId');
    const userId = session.user.id;
    const encoder = new TextEncoder();
    let alive = true;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: any) => {
                if (!alive) return;
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                } catch { alive = false; }
            };

            send('connected', { ts: Date.now() });

            let lastMessageCheck = new Date();
            let lastConvoCheck = new Date(0);

            const check = async () => {
                if (!alive) return;
                try {
                    // New messages in active conversation
                    if (conversationId) {
                        const newMsgs = await prisma.directMessage.findMany({
                            where: { conversationId, createdAt: { gt: lastMessageCheck } },
                            include: { sender: { select: { id: true, name: true, image: true } } },
                            orderBy: { createdAt: 'asc' },
                        });
                        if (newMsgs.length > 0) {
                            send('messages', newMsgs.map(m => ({
                                id: m.id,
                                conversationId: m.conversationId,
                                senderId: m.senderId,
                                sender: m.sender,
                                content: m.content,
                                attachments: m.attachments,
                                createdAt: m.createdAt.toISOString(),
                            })));
                            lastMessageCheck = newMsgs[newMsgs.length - 1].createdAt;
                        }
                    }

                    // Conversation list updates (every 3s)
                    const now = new Date();
                    if (now.getTime() - lastConvoCheck.getTime() > 3000) {
                        lastConvoCheck = now;
                        const participants = await prisma.conversationParticipant.findMany({
                            where: { userId },
                            select: { conversationId: true, lastReadAt: true },
                        });
                        let totalUnread = 0;
                        for (const p of participants) {
                            const unread = await prisma.directMessage.count({
                                where: {
                                    conversationId: p.conversationId,
                                    senderId: { not: userId },
                                    createdAt: { gt: p.lastReadAt || new Date(0) },
                                },
                            });
                            totalUnread += unread;
                        }
                        send('unread', { totalUnread });
                    }
                } catch {}
            };

            const interval = setInterval(check, 500);
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
