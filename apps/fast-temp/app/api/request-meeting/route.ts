import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { notifyAllUsers } from '@/lib/notify-leaders';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';
import { requestMeetingSchema, validate } from '@/lib/validations';

// POST — Create a new pending partner meeting request
export const POST = withErrorHandler(async (request: NextRequest) => {
    const body = await request.json();
    const parsed = validate(requestMeetingSchema, body);
    if (!parsed.success) return parsed.response;

    const { title, description, meetingDate, startTime, endTime, meetingType, requesterName, invitedUsers } = parsed.data;

    // Include requester and meeting type context in the description
    const fullDesc = `${description ? description + '\n\n' : ''}Requester: ${requesterName}\nMeeting Type: ${meetingType}`;

    // 1. Create the meeting
    const meeting = await prisma.meeting.create({
        data: {
            title,
            description: fullDesc,
            meetingDate,
            startTime,
            endTime,
            source: 'partner_relations',
            status: 'pending',
            assignedTo: invitedUsers[0], // Best effort basic assignment
            createdBy: invitedUsers[0],  // Use first invited user as creator
        },
    });

    // 2. Add all invited users as guests
    await prisma.meetingGuest.createMany({
        data: invitedUsers.map((userId: string) => ({
            meetingId: meeting.id,
            userId,
        })),
    });

    // 3. Notify all users about the new meeting request
    await notifyAllUsers(
        'reminder',
        'New Partner Meeting Request',
        `A new meeting request from ${requesterName} is pending approval: "${title}" on ${meetingDate}`,
        { meeting_id: meeting.id, meeting_date: meeting.meetingDate }
    );

    return successResponse(meeting, 201);
});
