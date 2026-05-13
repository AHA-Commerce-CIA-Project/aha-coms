import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// SSE — pushes new notifications to the client as they're created. Replaces the
// 30s polling loop in TopNav so toast popups arrive in (sub-)second time. Same
// pattern as /api/chat/stream and /api/channels/stream.
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return new Response('Unauthorized', { status: 401 });

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

            // Anchor at "right now" — clients are expected to fetch their initial
            // list separately, then this stream only sends notifications created
            // after the connection opened.
            let lastCheck = new Date();

            const tick = async () => {
                if (!alive) return;
                try {
                    const fresh = await prisma.notification.findMany({
                        where: {
                            userId,
                            createdAt: { gt: lastCheck },
                        },
                        orderBy: { createdAt: 'asc' },
                    });
                    if (fresh.length > 0) {
                        for (const n of fresh) {
                            send('notification', {
                                id: n.id,
                                user_id: n.userId,
                                type: n.type,
                                title: n.title,
                                message: n.message,
                                read: n.read,
                                data: n.data,
                                created_at: n.createdAt.toISOString(),
                            });
                        }
                        lastCheck = fresh[fresh.length - 1].createdAt;
                    }
                } catch {}
            };

            // Heartbeat keeps proxies/browsers from closing the idle connection.
            const heartbeat = setInterval(() => {
                if (!alive) return;
                try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { alive = false; }
            }, 25000);

            const interval = setInterval(tick, 1000);
            request.signal.addEventListener('abort', () => {
                alive = false;
                clearInterval(interval);
                clearInterval(heartbeat);
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
