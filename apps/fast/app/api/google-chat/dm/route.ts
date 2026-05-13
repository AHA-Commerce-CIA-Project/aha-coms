import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { getChatClient } from '@/lib/google-chat';

// POST — Create or find a DM space with a user by email
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const chat = await getChatClient(session.user.id);
    if (!chat) return NextResponse.json({ error: 'Google Chat not connected. Please reconnect your Google account.' }, { status: 400 });

    // Try spaces.setup (preferred - creates or finds existing DM)
    try {
        const res = await chat.spaces.setup({
            requestBody: {
                space: {
                    spaceType: 'DIRECT_MESSAGE',
                },
                memberships: [
                    { member: { name: `users/${email}`, type: 'HUMAN' } },
                ],
            },
        });

        console.log('DM space created/found:', res.data.name);
        return NextResponse.json({
            name: res.data.name,
            displayName: res.data.displayName || email.split('@')[0],
            type: res.data.type || 'DM',
            spaceType: res.data.spaceType || 'DIRECT_MESSAGE',
        });
    } catch (err: any) {
        const errorMsg = err.message || '';
        const errorDetails = err.response?.data?.error?.message || errorMsg;
        console.error('Google Chat DM error:', errorDetails);

        // Check common issues
        if (errorDetails.includes('PERMISSION_DENIED') || errorDetails.includes('forbidden')) {
            return NextResponse.json({
                error: 'Permission denied. Make sure Google Chat API is enabled and chat scopes are granted. Try reconnecting your Google account.'
            }, { status: 403 });
        }
        if (errorDetails.includes('not found') || errorDetails.includes('NOT_FOUND')) {
            return NextResponse.json({
                error: `User ${email} not found in Google Workspace. They must be a Google Workspace user in your organization.`
            }, { status: 404 });
        }

        return NextResponse.json({ error: errorDetails || 'Failed to create DM. Please try again.' }, { status: 500 });
    }
}
