import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/google-calendar';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

export async function GET(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oauth2Client = getOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/chat.spaces.readonly',
            'https://www.googleapis.com/auth/chat.messages',
            'https://www.googleapis.com/auth/chat.memberships.readonly',
        ],
        state: session.user.id,
    });

    return NextResponse.json({ url: authUrl });
}
