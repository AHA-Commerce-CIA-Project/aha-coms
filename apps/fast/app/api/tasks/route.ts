import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { logActivity } from '@/lib/activity-log';
import { sanitizeRichText } from '@/lib/sanitize';
import crypto from 'crypto';

// POST /api/tasks — Leader creates a task directly and assigns it to a team member
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const caller = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            team: { select: { name: true } },
        },
    });
    if (caller?.role !== 'leader' && caller?.role !== 'admin') {
        return NextResponse.json({ error: 'Only leaders can create tasks directly' }, { status: 403 });
    }

    const body = await request.json();
    const {
        title,
        description,
        urgency,
        assigneeId,
        dueDate,
        dueDateTime,
        requestType,
        imageUrl,
        fileUrls,
        referenceUrls,
    } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!assigneeId || typeof assigneeId !== 'string') {
        return NextResponse.json({ error: 'Assignee is required' }, { status: 400 });
    }

    const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, name: true, accountStatus: true },
    });
    if (!assignee) {
        return NextResponse.json({ error: 'Assignee not found' }, { status: 404 });
    }
    if (assignee.accountStatus !== 'active') {
        return NextResponse.json({ error: 'Cannot assign to an inactive account' }, { status: 400 });
    }

    const taskToken = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Compute deadline: selected date at captured WIB time
    let computedDueDate: Date | null = null;
    if (dueDate) {
        const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
        const selectedDate = new Date(dueDate);
        let hh: number, mm: number, ss: number;
        const m = dueDateTime && /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(dueDateTime);
        if (m) {
            hh = parseInt(m[1], 10);
            mm = parseInt(m[2], 10);
            ss = parseInt(m[3], 10);
        } else {
            // Default to end-of-day WIB so "today" isn't overdue the moment it's created
            hh = 23; mm = 59; ss = 59;
        }
        const deadlineWIB = Date.UTC(
            selectedDate.getUTCFullYear(),
            selectedDate.getUTCMonth(),
            selectedDate.getUTCDate(),
            hh, mm, ss,
        );
        computedDueDate = new Date(deadlineWIB - WIB_OFFSET_MS);
    }

    const safeFileUrls = Array.isArray(fileUrls) ? fileUrls.filter((u: any) => typeof u === 'string') : [];
    const safeRefUrls = Array.isArray(referenceUrls) ? referenceUrls.filter((u: any) => typeof u === 'string') : [];

    const task = await prisma.task.create({
        data: {
            title: title.trim(),
            description: sanitizeRichText(description),
            requesterName: caller.name,
            requesterEmail: caller.email,
            requesterDivision: caller.team?.name || null,
            requestType: requestType || 'internal',
            urgency: urgency || 'P3',
            // Leader-to-member tasks are auto-accepted (no approval gate),
            // but still surface in the Direct Requests tab via source.
            status: 'in-progress',
            source: 'direct_request',
            assigneeId: assignee.id,
            dueDate: computedDueDate,
            attachmentLink: (typeof imageUrl === 'string' && imageUrl) ? imageUrl : null,
            taskToken,
            customFields: { fileUrls: safeFileUrls, referenceUrls: safeRefUrls },
        },
        select: { id: true, taskToken: true, title: true },
    });

    // Notify assignee
    await prisma.notification.create({
        data: {
            userId: assignee.id,
            type: 'task_assigned',
            title: 'You have been assigned a task',
            message: `${caller.name} assigned you: "${task.title}"`,
            data: { task_id: task.id, task_token: task.taskToken },
        },
    });

    logActivity(
        caller.id,
        'task_assigned',
        `${caller.name} created and assigned "${task.title}" to ${assignee.name}`,
        'task',
        task.id,
    );

    return NextResponse.json({ success: true, id: task.id, taskToken: task.taskToken }, { status: 201 });
}
