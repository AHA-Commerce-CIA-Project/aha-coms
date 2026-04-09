import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-response';

// GET — Fetch guests for a meeting
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;

    const guests = await prisma.meetingGuest.findMany({
        where: { meetingId: id },
        include: {
            user: { select: { id: true, name: true, email: true, role: true } },
        },
    });

    return successResponse(guests);
});

// POST — Add a guest to a meeting
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) return errorResponse('userId is required', 400);

    try {
        const guest = await prisma.meetingGuest.create({
            data: { meetingId: id, userId },
            include: {
                user: { select: { id: true, name: true, email: true, role: true } },
            },
        });

        // Get meeting details for notification
        const meeting = await prisma.meeting.findUnique({
            where: { id },
            select: { title: true, meetingDate: true, startTime: true },
        });

        // Get inviter name
        const inviter = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true },
        });

        // Notify the guest
        if (meeting) {
            const dateStr = new Date(meeting.meetingDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'reminder',
                    title: 'Meeting Invitation',
                    message: `${inviter?.name || 'Someone'} invited you to "${meeting.title}" on ${dateStr} at ${meeting.startTime}`,
                    read: false,
                    data: { meeting_id: id, meeting_date: meeting.meetingDate },
                },
            });
        }

        return successResponse(guest, 201);
    } catch (err: any) {
        // Unique constraint violation (user already a guest)
        if (err.code === 'P2002') {
            return errorResponse('User is already a guest', 409);
        }
        throw err; // Re-throw for withErrorHandler to catch
    }
});

// DELETE — Remove a guest from a meeting
export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth();
    if (!session) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) return errorResponse('userId is required', 400);

    await prisma.meetingGuest.deleteMany({
        where: { meetingId: id, userId },
    });

    return successResponse({ deleted: true });
});
