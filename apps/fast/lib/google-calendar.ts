// Google Calendar integration helper library — Prisma version

import { google } from 'googleapis';
import { prisma } from '@/lib/db';

export function getOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

/**
 * Get stored Google tokens from DB for a specific user
 */
export async function getStoredTokens(userId: string): Promise<{ access_token: string; refresh_token: string; expiry_date: number } | null> {
    const token = await prisma.googleToken.findUnique({
        where: { userId },
    });

    if (!token) return null;
    return {
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expiry_date: Number(token.expiryDate ?? 0),
    };
}

/**
 * Save/update Google tokens in DB for a specific user
 */
export async function saveTokens(userId: string, tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }) {
    await prisma.googleToken.upsert({
        where: { userId },
        update: {
            accessToken: tokens.access_token ?? undefined,
            refreshToken: tokens.refresh_token ?? undefined,
            expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
            updatedAt: new Date(),
        },
        create: {
            userId,
            accessToken: tokens.access_token || '',
            refreshToken: tokens.refresh_token || '',
            expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
        },
    });
}

/**
 * Get an authenticated Google Calendar client for a specific user
 */
export async function getCalendarClient(userId: string) {
    const tokens = await getStoredTokens(userId);
    if (!tokens) return null;

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Auto-refresh if expired
    if (tokens.expiry_date && Date.now() > tokens.expiry_date) {
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            await saveTokens(userId, {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token || tokens.refresh_token,
                expiry_date: credentials.expiry_date,
            });
            oauth2Client.setCredentials(credentials);
        } catch (err: any) {
            console.error('Failed to refresh tokens:', err.message);
            return null;
        }
    }

    return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Fetch events from Google Calendar for a given month
 */
export async function getCalendarEvents(userId: string, year: number, month: number) {
    const calendar = await getCalendarClient(userId);
    if (!calendar) return [];

    const timeMin = new Date(year, month, 1).toISOString();
    const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    try {
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 100,
        });

        return (res.data.items || []).map(event => {
            const hangoutLink = event.hangoutLink
                || event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri
                || null;
            const organizerName = event.organizer?.displayName
                || event.organizer?.email
                || null;
            const attendees = (event.attendees || []).map(a => ({
                id: a.email || '',
                email: a.email || '',
                name: a.displayName || a.email || '',
                responseStatus: a.responseStatus || 'needsAction',
                organizer: a.organizer || false,
            }));
            return {
                google_event_id: event.id,
                owner_id: userId,
                title: event.summary || 'Untitled',
                description: event.description || null,
                meeting_date: event.start?.date || (event.start?.dateTime
                    ? new Date(event.start.dateTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                    : ''),
                start_time: event.start?.dateTime
                    ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
                    : '00:00',
                end_time: event.end?.dateTime
                    ? new Date(event.end.dateTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
                    : '23:59',
                location: event.location || null,
                source: 'google_calendar',
                status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
                guests: attendees,
                meeting_link: hangoutLink,
                organizer_name: organizerName,
                organizer_email: event.organizer?.email || null,
            };
        });
    } catch (err: any) {
        console.error('Google Calendar fetch error:', err.message);
        return [];
    }
}

/**
 * Create an event on Google Calendar
 */
export async function createCalendarEvent(userId: string, meeting: {
    title: string;
    description?: string;
    meeting_date: string;
    start_time: string;
    end_time: string;
    location?: string;
    guests?: string[];
}) {
    const calendar = await getCalendarClient(userId);
    if (!calendar) return null;

    const startDateTime = `${meeting.meeting_date}T${meeting.start_time}:00`;
    const endDateTime = `${meeting.meeting_date}T${meeting.end_time}:00`;

    try {
        const res = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: meeting.title,
                description: meeting.description || undefined,
                location: meeting.location || undefined,
                start: { dateTime: startDateTime, timeZone: 'Asia/Jakarta' },
                end: { dateTime: endDateTime, timeZone: 'Asia/Jakarta' },
                attendees: meeting.guests?.map(email => ({ email })),
            },
        });

        return res.data.id || null;
    } catch (err: any) {
        console.error('Google Calendar create error:', err.message);
        return null;
    }
}

/**
 * Update an event on Google Calendar
 */
export async function updateCalendarEvent(userId: string, eventId: string, meeting: {
    title?: string;
    description?: string;
    meeting_date?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
}) {
    const calendar = await getCalendarClient(userId);
    if (!calendar) return false;

    try {
        const requestBody: any = {};
        if (meeting.title) requestBody.summary = meeting.title;
        if (meeting.description !== undefined) requestBody.description = meeting.description;
        if (meeting.location !== undefined) requestBody.location = meeting.location;
        if (meeting.meeting_date && meeting.start_time) {
            requestBody.start = {
                dateTime: `${meeting.meeting_date}T${meeting.start_time}:00`,
                timeZone: 'Asia/Jakarta',
            };
        }
        if (meeting.meeting_date && meeting.end_time) {
            requestBody.end = {
                dateTime: `${meeting.meeting_date}T${meeting.end_time}:00`,
                timeZone: 'Asia/Jakarta',
            };
        }

        await calendar.events.patch({
            calendarId: 'primary',
            eventId,
            requestBody,
        });

        return true;
    } catch (err: any) {
        console.error('Google Calendar update error:', err.message);
        return false;
    }
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteCalendarEvent(userId: string, eventId: string) {
    const calendar = await getCalendarClient(userId);
    if (!calendar) return false;

    try {
        await calendar.events.delete({
            calendarId: 'primary',
            eventId,
        });
        return true;
    } catch (err: any) {
        console.error('Google Calendar delete error:', err.message);
        return false;
    }
}

/**
 * Check if Google Calendar is connected (tokens exist)
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
    const tokens = await getStoredTokens(userId);
    return tokens !== null && !!tokens.refresh_token;
}
