import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client, saveTokens } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const userId = request.nextUrl.searchParams.get('state');

    if (!code || !userId) {
        return NextResponse.redirect(new URL('/tasks?gcal=error&reason=missing_params', request.url));
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        await saveTokens(userId, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
        });

        return NextResponse.redirect(new URL('/tasks?gcal=connected', request.url));
    } catch (err: any) {
        console.error('Google OAuth callback error:', err.message);
        return NextResponse.redirect(new URL('/tasks?gcal=error&reason=token_exchange', request.url));
    }
}
