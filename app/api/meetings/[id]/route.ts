import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar';

// PUT — Update meeting (approve pending, edit details, sync to Google Calendar)
export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const body = await request.json();
    const userId = session.user.id;

    // Get user role
    const profile = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    const isLeader = profile?.role === 'leader';

    // Build update object
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.meetingDate !== undefined) updates.meetingDate = body.meetingDate;
    if (body.startTime !== undefined) updates.startTime = body.startTime;
    if (body.endTime !== undefined) updates.endTime = body.endTime;
    if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
    if (body.notifyBefore !== undefined) updates.notifyBefore = body.notifyBefore;

    // Only leaders can approve pending meetings
    if (body.status === 'confirmed' && isLeader) {
        updates.status = 'confirmed';
    }

    // Build where clause — non-leaders can only update own meetings
    const where: any = { id };
    if (!isLeader) {
        where.createdBy = userId;
    }

    const data = await prisma.meeting.update({
        where,
        data: updates,
    });

    // Sync edit to Google Calendar if connected
    if (data.googleEventId) {
        try {
            await updateCalendarEvent(userId, data.googleEventId, {
                title: body.title,
                description: body.description,
                meeting_date: body.meetingDate,
                start_time: body.startTime,
                end_time: body.endTime,
            });
        } catch (err: any) {
            console.error('Google Calendar update sync error (non-blocking):', err.message);
        }
    }

    // If notify_before was updated, notify all guests
    if (body.notifyBefore !== undefined && body.notifyBefore > 0) {
        const guests = await prisma.meetingGuest.findMany({
            where: { meetingId: id },
            select: { userId: true },
        });

        if (guests.length > 0) {
            const meeting = await prisma.meeting.findUnique({
                where: { id },
                select: { title: true, meetingDate: true, startTime: true },
            });

            if (meeting) {
                const dateStr = new Date(meeting.meetingDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                await prisma.notification.createMany({
                    data: guests.map(g => ({
                        userId: g.userId,
                        type: 'reminder',
                        title: 'Meeting Reminder Set',
                        message: `Reminder: "${meeting.title}" on ${dateStr} at ${meeting.startTime} — ${body.notifyBefore} min before`,
                        read: false,
                        data: { meeting_id: id, meeting_date: meeting.meetingDate },
                    })),
                });
            }
        }
    }

    return successResponse(data);
});

// DELETE — Delete meeting (+ sync to Google Calendar)
export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const userId = session.user.id;

    // Get user role
    const profile = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    const isLeader = profile?.role === 'leader';

    // Check for Google Calendar event to delete
    const meeting = await prisma.meeting.findUnique({
        where: { id },
        select: { googleEventId: true, createdBy: true },
    });

    // Non-leaders can only delete own meetings
    if (!isLeader && meeting?.createdBy !== userId) {
        return errorResponse('You can only delete your own meetings', 403);
    }

    // Sync delete to Google Calendar if connected
    if (meeting?.googleEventId) {
        try {
            await deleteCalendarEvent(userId, meeting.googleEventId);
        } catch (err: any) {
            console.error('Google Calendar delete sync error (non-blocking):', err.message);
        }
    }

    // Cascade delete handles guests via Prisma relations
    await prisma.meeting.delete({ where: { id } });

    return successResponse({ deleted: true });
});
