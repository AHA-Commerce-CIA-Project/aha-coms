import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { createCalendarEvent, deleteCalendarEvent, isGoogleCalendarConnected } from '@/lib/google-calendar';
import { createMeetingSchema, validate } from '@/lib/validations';

// GET — Fetch meetings
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user role
    const profile = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    const isLeader = profile?.role === 'leader' || profile?.role === 'admin';

    // Parse optional month filter (YYYY-MM)
    const month = request.nextUrl.searchParams.get('month');

    // Parse userIds filter for subscribed calendars
    const userIdsParam = request.nextUrl.searchParams.get('userIds');
    const userIdsToFetch = userIdsParam ? userIdsParam.split(',') : [userId];
    if (!userIdsToFetch.includes(userId)) {
        userIdsToFetch.push(userId);
    }

    // Build where clause
    type MeetingWhere = {
        meetingDate?: { gte: string; lte: string };
        OR?: Array<{ assignedTo?: { in: string[] }; createdBy?: { in: string[] }; id?: { in: string[] } }>;
    };
    const where: MeetingWhere = {};

    // Date filter
    if (month) {
        const [year, mon] = month.split('-').map(Number);
        const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
        const endDate = new Date(year, mon, 0);
        const endDateStr = `${year}-${String(mon).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        where.meetingDate = { gte: startDate, lte: endDateStr };
    }

    // Visibility filter
    if (isLeader && !userIdsParam) {
        // Leaders see all meetings if no userIds filter
    } else {
        // Find meetings where the requested users are guests
        const guestEntries = await prisma.meetingGuest.findMany({
            where: { userId: { in: userIdsToFetch } },
            select: { meetingId: true },
        });
        const guestMeetingIds = guestEntries.map(g => g.meetingId);

        const orConditions: Array<{ assignedTo?: { in: string[] }; createdBy?: { in: string[] }; id?: { in: string[] } }> = [
            { assignedTo: { in: userIdsToFetch } },
            { createdBy: { in: userIdsToFetch } },
        ];
        if (guestMeetingIds.length > 0) {
            orConditions.push({ id: { in: guestMeetingIds } });
        }
        where.OR = orConditions;
    }

    const meetings = await prisma.meeting.findMany({
        where,
        include: {
            creator: { select: { name: true } },
            assignee: { select: { name: true } },
            guests: {
                include: {
                    user: { select: { id: true, name: true } },
                },
            },
        },
        orderBy: [
            { meetingDate: 'asc' },
            { startTime: 'asc' },
        ],
    });

    // Transform to snake_case for frontend compatibility
    const result = meetings.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        meeting_date: m.meetingDate,
        start_time: m.startTime,
        end_time: m.endTime,
        created_by: m.createdBy,
        assigned_to: m.assignedTo,
        source: m.source,
        status: m.status,
        notify_before: m.notifyBefore,
        google_event_id: m.googleEventId,
        created_at: m.createdAt.toISOString(),
        creator: m.creator,
        assignee: m.assignee,
        guests: m.guests.map(g => g.user),
    }));

    return NextResponse.json(result);
}

// POST — Create meeting (+ sync to Google Calendar)
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const parsed = validate(createMeetingSchema, body);
    if (!parsed.success) return parsed.response;

    const { title, description, meetingDate, startTime, endTime, assignedTo, source, guestIds } = parsed.data;

    const profile = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    const isLeader = profile?.role === 'leader' || profile?.role === 'admin';

    let meetingSource = source || 'member';
    let meetingStatus = 'confirmed';

    if (isLeader) {
        meetingSource = 'leader';
        meetingStatus = 'confirmed';
    } else if (meetingSource === 'partner_relations') {
        meetingStatus = 'pending';
    } else {
        meetingSource = 'member';
        meetingStatus = 'confirmed';
    }

    // Sync to Google Calendar if connected
    let googleEventId: string | null = null;
    try {
        const gcalConnected = await isGoogleCalendarConnected(userId);
        if (gcalConnected) {
            let guestEmails: string[] = [];
            if (guestIds && guestIds.length > 0) {
                const guestUsers = await prisma.user.findMany({
                    where: { id: { in: guestIds } },
                    select: { email: true },
                });
                guestEmails = guestUsers.map(u => u.email).filter(Boolean);
            }

            googleEventId = await createCalendarEvent(userId, {
                title,
                description: description || undefined,
                meeting_date: meetingDate,
                start_time: startTime,
                end_time: endTime,
                guests: guestEmails,
            });
        }
    } catch (err: any) {
        console.error('Google Calendar sync error (non-blocking):', err.message);
    }

    const meeting = await prisma.meeting.create({
        data: {
            title,
            description: description || null,
            meetingDate,
            startTime,
            endTime,
            createdBy: userId,
            assignedTo: assignedTo || userId,
            source: meetingSource,
            status: meetingStatus,
            googleEventId,
        },
    });

    // Insert guest records if provided
    if (guestIds && guestIds.length > 0) {
        await prisma.meetingGuest.createMany({
            data: guestIds.map((gId: string) => ({
                meetingId: meeting.id,
                userId: gId,
            })),
        });
    }

    return NextResponse.json(meeting, { status: 201 });
}

// DELETE — Delete meeting (+ sync to Google Calendar)
export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await request.json();
    if (!id) {
        return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }

    // Get the meeting to check for google_event_id
    const meeting = await prisma.meeting.findUnique({
        where: { id },
        select: { googleEventId: true },
    });

    // Delete from Google Calendar if synced
    if (meeting?.googleEventId) {
        try {
            await deleteCalendarEvent(session.user.id, meeting.googleEventId);
        } catch (err: any) {
            console.error('Google Calendar delete sync error:', err.message);
        }
    }

    // Cascade delete handles guests automatically via Prisma relations
    await prisma.meeting.delete({ where: { id } });

    return NextResponse.json({ success: true });
}
