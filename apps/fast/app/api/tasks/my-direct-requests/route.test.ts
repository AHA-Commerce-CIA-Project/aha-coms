/**
 * Unit tests for GET /fast/api/tasks/my-direct-requests — the
 * assignee-scoped view of direct-request tasks.
 *
 * The route filters by source='direct_request', assigneeId=session.user.id,
 * and a status whitelist. The whitelist is the load-bearing thing under
 * test: it must include every status that represents "the assignee still
 * owns this task", because the sibling admin endpoint
 * /api/tasks/direct-requests-all returns the same population with no
 * status filter. Any status the whitelist omits is a silent visibility
 * gap where the assignee can't see a task that admin can.
 *
 * Specifically, 'pending' is the DB status for tasks the assignee has
 * put On Hold (see apps/fast/app/api/tasks/[id]/pending/route.ts — the
 * pending endpoint snapshots the prior status into pendedFromStatus and
 * flips status to 'pending'). Omitting it from the whitelist makes
 * on-hold tasks vanish from the assignee's own list while still showing
 * for admins via direct-requests-all — the exact symptom that drove
 * this fix.
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1' } }))
const taskFindManyMock = mock(async () => [] as unknown[])
const archivedFindManyMock = mock(async () => [] as unknown[])

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: taskFindManyMock,
    },
    userArchivedTask: {
      findMany: archivedFindManyMock,
    },
  },
}))

const { GET } = await import('./route')

function makeTaskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task-1',
    title: 'Permintaan Brand Pada Meeting Bulanan',
    description: null,
    status: 'pending',
    priority: 'P4',
    urgency: null,
    requesterName: 'Mega Okta Mahendra',
    requesterEmail: 'mega@example.com',
    requesterDivision: 'Partner Relationship (PR)',
    customFields: null,
    difficultyScore: null,
    requestType: null,
    attachmentLink: null,
    taskToken: '7DC05286',
    completedBy: null,
    actualTimeSpent: null,
    timeUnit: null,
    resolutionSummary: null,
    dueDate: null,
    assigneeId: 'user-1',
    source: 'direct_request',
    directAssigneeId: 'user-1',
    createdAt: new Date('2026-05-05T07:51:00.000Z'),
    claimedAt: new Date('2026-05-07T02:51:00.000Z'),
    completedAt: null,
    needsHelp: false,
    helpRequestedAt: null,
    pendingReason: 'Awaiting requester clarification',
    pendingTag: 'HOL',
    pendedAt: new Date('2026-05-07T02:51:00.000Z'),
    pendedFromStatus: 'in-progress',
    assignee: { name: 'Lintang P. O. Thiertian' },
    completedByUser: null,
    _count: { collaborators: 0 },
    collaborators: [],
    ...overrides,
  }
}

describe('GET /api/tasks/my-direct-requests', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    taskFindManyMock.mockReset()
    archivedFindManyMock.mockReset()
    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1' } }))
    archivedFindManyMock.mockImplementation(async () => [])
    taskFindManyMock.mockImplementation(async () => [])
  })

  it('returns 401 when the session is null', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(taskFindManyMock).not.toHaveBeenCalled()
  })

  it("includes 'pending' in the status whitelist so On Hold tasks stay visible to the assignee", async () => {
    await GET()

    expect(taskFindManyMock).toHaveBeenCalledTimes(1)
    const args = taskFindManyMock.mock.calls[0]?.[0] as { where: { status: { in: string[] } } }
    expect(args.where.status.in).toContain('pending')
  })

  it('whitelists every status the route claims to surface — in-progress, review, done, pending_completion_details, pending', async () => {
    await GET()

    const args = taskFindManyMock.mock.calls[0]?.[0] as { where: { status: { in: string[] } } }
    expect(args.where.status.in.sort()).toEqual(
      ['done', 'in-progress', 'pending', 'pending_completion_details', 'review'],
    )
  })

  it('returns an on-hold (status=pending) task assigned to the caller, with the pended_from_status preserved', async () => {
    taskFindManyMock.mockImplementationOnce(async () => [makeTaskRow()])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<Record<string, unknown>>
    expect(body).toHaveLength(1)
    expect(body[0]?.id).toBe('task-1')
    expect(body[0]?.status).toBe('pending')
    expect(body[0]?.pended_from_status).toBe('in-progress')
    expect(body[0]?.pending_tag).toBe('HOL')
  })
})
