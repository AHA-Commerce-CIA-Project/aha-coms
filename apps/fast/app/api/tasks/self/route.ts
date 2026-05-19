import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { sanitizeRichText } from '@/lib/sanitize';
import crypto from 'crypto';

// POST /api/tasks/self — any authenticated user creates a self-assigned
// task that lands directly in their own active Task Inbox lane. Distinct
// from POST /api/tasks (leader-only, assigns to others) and from
// /api/request (public guest form via /track) — this endpoint exists
// because team members had no first-party way to create their own
// personal cards inside the app.
//
// Tasks land as `direct_assign` source with the creator as both
// requester AND assignee, claimed immediately so the inbox shows them
// in the "In Progress" column rather than "Unclaimed" (which would
// confusingly invite teammates to claim something the creator already
// owns).
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, urgency, targetChannelId } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const caller = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            teamId: true,
            team: { select: { name: true } },
        },
    });
    if (!caller) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const taskToken = crypto.randomBytes(4).toString('hex').toUpperCase();

    const task = await prisma.task.create({
        data: {
            title: title.trim(),
            description: sanitizeRichText(description || ''),
            // Self-as-requester so the inbox card reads "Created by <name>"
            // honestly rather than impersonating someone else. requestType
            // 'self' is a new tag — existing filters that don't recognise
            // it default to general handling, no migration needed.
            requesterName: caller.name,
            requesterEmail: caller.email,
            requesterDivision: caller.team?.name || null,
            requestType: 'self',
            urgency: urgency || 'P3',
            // Already in-progress + self-claimed so the card lands in the
            // user's active lane straight away. Routing through 'todo' +
            // unclaimed would surface a dead "Claim" button to teammates
            // for a task the creator already owns.
            status: 'in-progress',
            source: 'direct_assign',
            assigneeId: caller.id,
            assignedTeamId: caller.teamId,
            targetChannelId: targetChannelId || null,
            claimedAt: new Date(),
            taskToken,
        },
        select: { id: true, taskToken: true, title: true },
    });

    return NextResponse.json(
        { success: true, id: task.id, taskToken: task.taskToken, title: task.title },
        { status: 201 },
    );
}
