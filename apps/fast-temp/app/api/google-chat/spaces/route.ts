import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { listSpaces } from '@/lib/google-chat';

export async function GET() {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const spaces = await listSpaces(session.user.id);
    return NextResponse.json({ spaces });
}
