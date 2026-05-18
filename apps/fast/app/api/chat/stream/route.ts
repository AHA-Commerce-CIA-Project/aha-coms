import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// SSE endpoint for real-time DM updates
export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
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
                        const result = await prisma.$queryRaw<{ total: bigint }[]>`
                            SELECT COUNT(*)::int AS total
                            FROM conversation_participants cp
                            JOIN direct_messages dm
                              ON dm.conversation_id = cp.conversation_id
                              AND dm.sender_id != cp.user_id
                              AND dm.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
                            WHERE cp.user_id = ${userId}
                        `;
                        const totalUnread = Number(result[0]?.total ?? 0);
                        send('unread', { totalUnread });
                    }
                } catch {}
            };

            const interval = setInterval(check, 2000);
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
