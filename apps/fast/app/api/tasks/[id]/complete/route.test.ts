/**
 * T1.13 — N+1 fix: milestone claims are now batched into a single
 * updateMany instead of one updateMany per eligible milestone.
 *
 * Key invariant: regardless of how many milestones are returned by
 * findMany, the route issues exactly ONE updateMany call (with all ids
 * in the WHERE clause and claimedById: null guard preserved for race safety).
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { NextRequest } from 'next/server'

const taskUpdateMock = mock(async () => ({
  id: 'task-1',
  title: 'Test Task',
  taskToken: null,
  requesterName: null,
  requesterEmail: null,
  status: 'done',
  completedAt: new Date(),
  completedBy: 'user-1',
  difficultyScore: null,
  actualTimeSpent: null,
  timeUnit: 'minutes',
  resolutionSummary: null,
}))
const taskCountMock = mock(async () => 3)
const milestoneFindManyMock = mock(async () => [] as { id: string }[])
const milestoneUpdateManyMock = mock(async () => ({ count: 0 }))

// Use inline mocks for modules not under test to avoid mockReset side effects.
mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: mock(async () => ({ user: { id: 'user-1', name: 'Tester', role: 'member' } })),
}))

mock.module('@/lib/db', () => ({
  prisma: {
    task: {
      update: taskUpdateMock,
      count: taskCountMock,
    },
    milestone: {
      findMany: milestoneFindManyMock,
      updateMany: milestoneUpdateManyMock,
    },
  },
}))

mock.module('@/lib/notify-leaders', () => ({
  notifyLeaders: mock(async () => {}),
}))

mock.module('@/lib/activity-log', () => ({
  logActivity: mock(() => {}),
}))

mock.module('@/lib/email', () => ({
  sendTaskCompletedEmail: mock(async () => {}),
}))

const { PUT } = await import('./route')

// Omit null values for fields with optional number schemas — Zod v4 rejects null
// for .optional() (not .nullable()) fields. Only pass fields with real values.
function makeRequest(overrides: Record<string, unknown> = {}): NextRequest {
  return {
    json: async () => ({
      completedBy: 'Tester',
      timeUnit: 'minutes',
      ...overrides,
    }),
  } as unknown as NextRequest
}

function makeParams(id = 'task-1') {
  return { params: Promise.resolve({ id }) }
}

describe('PUT /api/tasks/[id]/complete — T1.13 batched milestone updateMany', () => {
  beforeEach(() => {
    // Reset call counters and restore default implementations.
    taskUpdateMock.mockReset()
    taskCountMock.mockReset()
    milestoneFindManyMock.mockReset()
    milestoneUpdateManyMock.mockReset()

    taskUpdateMock.mockImplementation(async () => ({
      id: 'task-1', title: 'Test Task', taskToken: null, requesterName: null,
      requesterEmail: null, status: 'done', completedAt: new Date(), completedBy: 'user-1',
      difficultyScore: null, actualTimeSpent: null, timeUnit: 'minutes', resolutionSummary: null,
    }))
    taskCountMock.mockImplementation(async () => 3)
    milestoneFindManyMock.mockImplementation(async () => [])
    milestoneUpdateManyMock.mockImplementation(async () => ({ count: 0 }))
  })

  it('makes zero updateMany calls when no milestones are eligible', async () => {
    // Default: milestoneFindManyMock returns []
    const res = await PUT(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    expect(milestoneUpdateManyMock).toHaveBeenCalledTimes(0)
  })

  it('makes exactly ONE updateMany call when 3 milestones are eligible — not 3 separate calls', async () => {
    milestoneFindManyMock.mockImplementationOnce(async () => [
      { id: 'ms-1' },
      { id: 'ms-2' },
      { id: 'ms-3' },
    ])

    const res = await PUT(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    expect(milestoneUpdateManyMock).toHaveBeenCalledTimes(1)
  })

  it('passes all 3 milestone ids in a single WHERE IN clause', async () => {
    milestoneFindManyMock.mockImplementationOnce(async () => [
      { id: 'ms-a' },
      { id: 'ms-b' },
      { id: 'ms-c' },
    ])

    await PUT(makeRequest(), makeParams())

    expect(milestoneUpdateManyMock).toHaveBeenCalledTimes(1)
    const [updateArgs] = milestoneUpdateManyMock.mock.calls[0] as [{ where: { id: { in: string[] }; claimedById: null } }]
    expect(updateArgs.where.id).toEqual({ in: ['ms-a', 'ms-b', 'ms-c'] })
  })

  it('preserves the claimedById: null race-safety guard inside the WHERE clause', async () => {
    milestoneFindManyMock.mockImplementationOnce(async () => [{ id: 'ms-1' }])

    await PUT(makeRequest(), makeParams())

    expect(milestoneUpdateManyMock).toHaveBeenCalledTimes(1)
    const [updateArgs] = milestoneUpdateManyMock.mock.calls[0] as [{ where: { claimedById: null } }]
    expect(updateArgs.where.claimedById).toBeNull()
  })

  it('sets claimedById to the session user id in the UPDATE data', async () => {
    milestoneFindManyMock.mockImplementationOnce(async () => [{ id: 'ms-1' }])

    await PUT(makeRequest(), makeParams())

    expect(milestoneUpdateManyMock).toHaveBeenCalledTimes(1)
    const [updateArgs] = milestoneUpdateManyMock.mock.calls[0] as [{ data: { claimedById: string } }]
    expect(updateArgs.data.claimedById).toBe('user-1')
  })
})
