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
//
// Payload shape (post PR #52 — Step 1 toggle + paste-to-attach):
//   title:         required string
//   description:   optional string (sanitised)
//   urgency:       P1 | P2 | P3 | P4 | 5-minute (defaults to P3)
//   dueDate:       optional ISO date string (YYYY-MM-DD); converted to
//                  end-of-day WIB for storage, matching the convention
//                  /api/tasks uses for leader-created tasks
//   referenceUrls: optional string[] — http(s) only, stored in
//                  customFields.referenceUrls (no separate column)
//   fileUrls:      optional string[] — pasted/dropped image URLs already
//                  uploaded via /fast/api/upload, stored in
//                  customFields.fileUrls so the task-detail modal
//                  renders thumbnails the same way leader-created tasks do
//
// `type` and `targetChannelId` (in the v1 endpoint) were intentionally
// dropped: every personal card is a Standard Task implicitly, and the
// review screen shows a "Self-Assigned" pill in place of a channel/brand
// tag relation.
export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, urgency, dueDate, referenceUrls, fileUrls } = body;

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

    // Compute deadline at end-of-day WIB — same shape as
    // /api/tasks/route.ts:64-85 so personal cards and leader-assigned
    // cards order identically in the inbox's Deadline column.
    let computedDueDate: Date | null = null;
    if (dueDate && typeof dueDate === 'string') {
        const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
        const selectedDate = new Date(dueDate);
        if (!isNaN(selectedDate.getTime())) {
            const deadlineWIB = Date.UTC(
                selectedDate.getUTCFullYear(),
                selectedDate.getUTCMonth(),
                selectedDate.getUTCDate(),
                23, 59, 59,
            );
            computedDueDate = new Date(deadlineWIB - WIB_OFFSET_MS);
        }
    }

    // Reference URLs — http(s) only. Stored in customFields rather than
    // a dedicated column so we don't need a Prisma migration; the inbox
    // task-detail modal already reads customFields.referenceUrls for
    // leader-created tasks, so personal cards land in the same render
    // path with no consumer change.
    const safeReferenceUrls: string[] = Array.isArray(referenceUrls)
        ? referenceUrls
            .filter((u): u is string => typeof u === 'string')
            .map((u) => u.trim())
            .filter((u) => /^https?:\/\//i.test(u))
        : [];

    // Uploaded image URLs from the modal's paste/drop flow. These are
    // already-stored URLs returned by /fast/api/upload — http(s)-only
    // filter is the safety net against a malicious payload bypassing
    // the upload endpoint. Stored under customFields.fileUrls so the
    // task-detail modal renders the same attachment strip it renders
    // for leader-created tasks.
    const safeFileUrls: string[] = Array.isArray(fileUrls)
        ? fileUrls
            .filter((u): u is string => typeof u === 'string')
            .map((u) => u.trim())
            .filter((u) => /^https?:\/\//i.test(u))
        : [];

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
            claimedAt: new Date(),
            dueDate: computedDueDate,
            customFields: { fileUrls: safeFileUrls, referenceUrls: safeReferenceUrls },
            taskToken,
        },
        select: { id: true, taskToken: true, title: true },
    });

    return NextResponse.json(
        { success: true, id: task.id, taskToken: task.taskToken, title: task.title },
        { status: 201 },
    );
}
