import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client, saveTokens } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const userId = request.nextUrl.searchParams.get('state');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aha-coms.web.app';

    if (!code || !userId) {
        return NextResponse.redirect(`${appUrl}/fast/tasks?gcal=error&reason=missing_params`);
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        await saveTokens(userId, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
        });

        return NextResponse.redirect(`${appUrl}/fast/tasks?gcal=connected`);
    } catch (err: any) {
        console.error('Google OAuth callback error:', err.message);
        return NextResponse.redirect(`${appUrl}/fast/tasks?gcal=error&reason=token_exchange`);
    }
}
