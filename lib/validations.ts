import { z } from 'zod';
import { errorResponse } from './api-response';

// ─── Shared Enums ─────────────────────────────────────────────────────────────

const urgencyEnum = z.enum(['P1', 'P2', 'P3', 'P4', '5-minute']);
const statusEnum = z.enum(['todo', 'in-progress', 'review', 'done', 'archived']);
const timeUnitEnum = z.enum(['minutes', 'hours']);

// ─── Request Form (Public) ────────────────────────────────────────────────────

export const requestSchema = z.object({
    requesterName: z.string().min(1, 'Name is required').max(200),
    requesterDivision: z.string().max(200).optional(),
    requestType: z.string().max(100).optional(),
    title: z.string().min(1, 'Title is required').max(500),
    urgency: urgencyEnum.optional().default('P3'),
    description: z.string().min(1, 'Description is required').max(5000),
    dueDate: z.string().optional(),
    imageUrl: z.string().url().optional().nullable(),
});

// ─── Complete Task ────────────────────────────────────────────────────────────

export const completeTaskSchema = z.object({
    completedAt: z.string().optional(),
    completedBy: z.string().max(200).optional(),
    difficultyScore: z.number().int().min(1).max(10).optional(),
    actualTimeSpent: z.number().int().min(0).optional(),
    timeUnit: timeUnitEnum.optional().default('minutes'),
    resolutionSummary: z.string().max(5000).optional(),
    feedbackNotes: z.string().max(5000).optional(),
});

// ─── Update Task (Leader) ─────────────────────────────────────────────────────

export const updateTaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    urgency: urgencyEnum.optional(),
    status: statusEnum.optional(),
    due_date: z.string().optional().nullable(),
    request_type: z.string().max(100).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});

// ─── Create Meeting ──────────────────────────────────────────────────────────

export const createMeetingSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(5000).optional().nullable(),
    meetingDate: z.string().min(1, 'Date is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    assignedTo: z.string().uuid().optional(),
    source: z.string().optional(),
    guestIds: z.array(z.string().uuid()).optional(),
});

// ─── Request Meeting (Public/Partner) ─────────────────────────────────────────

export const requestMeetingSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(5000).optional(),
    meetingDate: z.string().min(1, 'Date is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    meetingType: z.string().optional(),
    requesterName: z.string().max(200).optional(),
    invitedUsers: z.array(z.string().uuid()).min(1, 'At least one member must be invited'),
});

// ─── Task Review ─────────────────────────────────────────────────────────────

export const taskReviewSchema = z.object({
    reviewerType: z.enum(['requester', 'completer']),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    // For requester reviews (public, no auth) — email is required for identity verification
    reviewerEmail: z.string().email().optional(),
    taskToken: z.string().optional(),
});

// ─── Validate Helper ─────────────────────────────────────────────────────────

/**
 * Parse `data` against a Zod schema.
 * Returns `{ success: true, data: T }` or `{ success: false, response: NextResponse }`.
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown):
    | { success: true; data: T }
    | { success: false; response: ReturnType<typeof errorResponse> } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }

    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join('.');
    const message = field
        ? `${field}: ${firstIssue.message}`
        : firstIssue.message;

    return { success: false, response: errorResponse(message, 400) };
}
