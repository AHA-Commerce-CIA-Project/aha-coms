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
// Payload shape (post PR #53 — 3-step wizard with conditional request type):
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
//   requestType:   optional 'self' | 'internal' | 'fix_request' |
//                  'google_sheets' | 'other'. Defaults to 'self' so
//                  cards created without the Step 1 "Include request
//                  details" toggle stay categorised as personal — but
//                  the My Tasks → Direct Tasks query bucket picks up
//                  every source='direct_assign' card assigned to the
//                  caller regardless of this value, so re-classifying
//                  doesn't accidentally hide the card.
//   brandCode:     optional string — only meaningful when
//                  requestType='fix_request' (Partner Request).
//                  Stored as a "[BRAND]" prefix on the task title, the
//                  same convention CreateTaskWizard uses for leader-
//                  created Partner Requests so brand-filtering surfaces
//                  light up the same way without a Prisma migration.
//   assigneeId:    optional string — Leaders/Masters/Admins can target
//                  a teammate from Step 1 of the Create Card flow. When
//                  unset (the standard-member path) the card lands on
//                  the caller. The API enforces the role gate so a
//                  payload from a non-leader caller can't smuggle in
//                  an assigneeId targeting someone else.
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
    const { title, description, urgency, dueDate, referenceUrls, fileUrls, requestType, brandCode, assigneeId } = body;

    // requestType allow-list — matches CreateTaskWizard.REQUEST_TYPES
    // plus the 'self' literal used by the modal's toggle-off path.
    // Anything else falls back to 'self' so a stray value can't smuggle
    // a card into a bucket it shouldn't appear in.
    const ALLOWED_REQUEST_TYPES = new Set(['self', 'internal', 'fix_request', 'google_sheets', 'other']);
    const safeRequestType: string = typeof requestType === 'string' && ALLOWED_REQUEST_TYPES.has(requestType)
        ? requestType
        : 'self';

    // Brand code only makes sense for Partner Requests — silently drop
    // it for every other type so a fixture replay can't bleed brand
    // metadata into an internal card.
    const safeBrandCode: string | null = safeRequestType === 'fix_request' && typeof brandCode === 'string' && brandCode.trim()
        ? brandCode.trim().toUpperCase()
        : null;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const caller = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            teamId: true,
            team: { select: { name: true } },
        },
    });
    if (!caller) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Optional leader-only override: a Leader/Master/Admin can pick a
    // different assignee from the Create Card Step 1 picker. Non-leader
    // callers silently fall back to self-assignment regardless of what
    // they send so a crafted payload can't drop a task on a teammate's
    // queue without authority. Resolve the target user up-front so we
    // can stamp the assignedTeamId from THEIR team row (not the caller's
    // — the team-inbox bucket reads off this column).
    const callerIsLeader = caller.role === 'leader' || caller.role === 'admin';
    let resolvedAssigneeId = caller.id;
    let resolvedAssignedTeamId: string | null = caller.teamId;
    if (callerIsLeader && typeof assigneeId === 'string' && assigneeId && assigneeId !== caller.id) {
        const targetUser = await prisma.user.findUnique({
            where: { id: assigneeId },
            select: { id: true, teamId: true },
        });
        if (!targetUser) {
            return NextResponse.json({ error: 'Assignee not found' }, { status: 404 });
        }
        resolvedAssigneeId = targetUser.id;
        resolvedAssignedTeamId = targetUser.teamId;
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

    // Prefix the title with [BRAND] when this is a Partner Request — same
    // convention CreateTaskWizard uses (no dedicated brand_code column on
    // the Task model). Leaves non-Partner titles untouched.
    const titleClean = title.trim();
    const finalTitle = safeBrandCode ? `[${safeBrandCode}] ${titleClean}` : titleClean;

    const task = await prisma.task.create({
        data: {
            title: finalTitle,
            description: sanitizeRichText(description || ''),
            // Self-as-requester so the inbox card reads "Created by <name>"
            // honestly rather than impersonating someone else. requestType
            // 'self' is a new tag — existing filters that don't recognise
            // it default to general handling, no migration needed.
            requesterName: caller.name,
            requesterEmail: caller.email,
            requesterDivision: caller.team?.name || null,
            requestType: safeRequestType,
            urgency: urgency || 'P3',
            // Already in-progress + claimed-by-target so the card lands
            // in the assignee's active lane straight away. Routing
            // through 'todo' + unclaimed would surface a dead "Claim"
            // button to teammates for a task the leader already owns
            // (or that the user self-claimed).
            status: 'in-progress',
            source: 'direct_assign',
            assigneeId: resolvedAssigneeId,
            assignedTeamId: resolvedAssignedTeamId,
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
