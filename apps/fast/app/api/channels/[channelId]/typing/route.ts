import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';

// In-memory typing status: channelId -> Map<userId, { name, timestamp }>
const typingUsers = new Map<string, Map<string, { name: string; timestamp: number }>>();

const TYPING_TIMEOUT = 4000; // 4 seconds

function cleanExpired(channelId: string) {
    const channel = typingUsers.get(channelId);
    if (!channel) return;
    const now = Date.now();
    for (const [userId, data] of channel) {
        if (now - data.timestamp > TYPING_TIMEOUT) {
            channel.delete(userId);
        }
    }
    if (channel.size === 0) typingUsers.delete(channelId);
}

// POST — Broadcast typing status
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ channelId: string }> }
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId } = await params;
    const userId = session.user.id;
    const userName = session.user.name || 'Someone';

    if (!typingUsers.has(channelId)) {
        typingUsers.set(channelId, new Map());
    }
    typingUsers.get(channelId)!.set(userId, { name: userName, timestamp: Date.now() });

    return NextResponse.json({ ok: true });
}

// GET — Get who's typing in a channel
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ channelId: string }> }
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId } = await params;
    const userId = session.user.id;

    cleanExpired(channelId);

    const channel = typingUsers.get(channelId);
    const typers: { id: string; name: string }[] = [];

    if (channel) {
        for (const [uid, data] of channel) {
            if (uid !== userId) {
                typers.push({ id: uid, name: data.name });
            }
        }
    }

    return NextResponse.json({ typing: typers });
}
