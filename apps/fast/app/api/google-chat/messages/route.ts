import { NextRequest, NextResponse } from 'next/server';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { listMessages, sendMessage } from '@/lib/google-chat';

// GET — List messages in a space
export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const spaceName = searchParams.get('space');
    if (!spaceName) return NextResponse.json({ error: 'space param required' }, { status: 400 });

    const pageToken = searchParams.get('pageToken') || undefined;
    const result = await listMessages(session.user.id, spaceName, 30, pageToken);
    return NextResponse.json(result);
}

// POST — Send a message
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { space, text, threadName } = await request.json();
    if (!space || !text?.trim()) return NextResponse.json({ error: 'space and text required' }, { status: 400 });

    const msg = await sendMessage(session.user.id, space, text.trim(), threadName);
    if (!msg) return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });

    return NextResponse.json(msg);
}
