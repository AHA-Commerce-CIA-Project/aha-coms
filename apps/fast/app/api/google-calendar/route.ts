import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { isGoogleCalendarConnected, getCalendarEvents } from '@/lib/google-calendar';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// GET — Check connection status & optionally fetch Google Calendar events
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'events') {
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
        const month = parseInt(searchParams.get('month') || String(new Date().getMonth()));

        // If userIds are provided, fetch for all of them (including current user)
        const userIdsParam = searchParams.get('userIds');
        const userIdsToFetch = userIdsParam ? userIdsParam.split(',') : [userId];

        if (!userIdsToFetch.includes(userId)) {
            userIdsToFetch.push(userId);
        }

        let allEvents: any[] = [];

        // Fetch events for each user in parallel
        await Promise.all(userIdsToFetch.map(async (uId) => {
            const userEvents = await getCalendarEvents(uId, year, month);
            allEvents = allEvents.concat(userEvents);
        }));

        return successResponse({ events: allEvents });
    }

    // Default: return connection status
    const connected = await isGoogleCalendarConnected(userId);
    return successResponse({ connected });
});
