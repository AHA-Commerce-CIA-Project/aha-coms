import { NextResponse } from 'next/server';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { listSpaces } from '@/lib/google-chat';

export async function GET() {
    const session = await requireFastAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const spaces = await listSpaces(session.user.id);
    return NextResponse.json({ spaces });
}
