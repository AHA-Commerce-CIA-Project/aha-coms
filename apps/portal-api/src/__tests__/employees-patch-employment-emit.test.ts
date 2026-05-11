/**
 * Tests for PATCH /v1/employees/:id wiring of emitEmploymentUpdated (PR 07-3).
 *
 * Spec 07 §API contract: when an HR field (branch / department / position /
 * phone / leaderName / birthDate) changes, the route must:
 *  1. Capture the pre-update employment block.
 *  2. Apply the update.
 *  3. Compute the delta against the post-update block.
 *  4. Fire emitEmploymentUpdated with { user: { portalSub }, employment: delta,
 *     previousEmployment: previousValues }.
 *
 * Non-HR-only edits (e.g. portalRole, name) must NOT emit employment.updated
 * (they still emit user.updated through the existing path).
 *
 * Strategy: inline-handler simulation — mirrors employees-sign-out.test.ts.
 * Real route logic lives in routes/employees.ts; this test exercises the
 * decision logic without mounting Elysia.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  hasHrFieldChanges,
  diffEmployment,
  type EmploymentBlock,
} from '../services/employment-resolution'

type UserHr = {
  branch: string | null
  department: string | null
  position: string | null
  phone: string | null
  leaderName: string | null
  birthDate: string | null
}

let userStore: Map<string, UserHr> = new Map()
let employmentEmits: Array<{
  user: { portalSub: string }
  employment: Partial<EmploymentBlock>
  previousEmployment: Partial<EmploymentBlock>
}> = []
let userUpdatedEmits: Array<{ userId: string; changedFields: string[] }> = []

beforeEach(() => {
  userStore = new Map<string, UserHr>([
    [
      'user-1',
      {
        branch: 'ID-JKT',
        department: 'ENG',
        position: 'Engineer',
        phone: '+62-555-0001',
        leaderName: 'Lead A',
        birthDate: '1990-01-01',
      },
    ],
  ])
  employmentEmits = []
  userUpdatedEmits = []
})

function userToBlock(u: UserHr): EmploymentBlock {
  return {
    branch: u.branch ? { taxonomyId: 'branches', key: u.branch, value: u.branch } : null,
    team: null,
    department: u.department
      ? { taxonomyId: 'departments', key: u.department, value: u.department }
      : null,
    position: u.position,
    phone: u.phone,
    employmentStatus: null,
    talentaId: null,
    attendanceName: null,
    leaderName: u.leaderName,
    birthDate: u.birthDate,
  }
}

/**
 * Inline simulation of the PATCH handler's emit decision logic. Mirrors the
 * structure of routes/employees.ts after PR 07-3 wiring.
 */
async function patchHandler(args: {
  userId: string
  body: Partial<UserHr> & { portalRole?: string; name?: string }
}): Promise<void> {
  const { portalRole, name, ...identityFieldsOnly } = args.body
  const changedFields = Object.keys(args.body).filter(
    (k) => (args.body as Record<string, unknown>)[k] !== undefined,
  )

  // Capture pre-update employment block iff HR fields are changing.
  const willChangeHr = hasHrFieldChanges(changedFields)
  const before = userStore.get(args.userId)
  if (!before) return
  const prevBlock = willChangeHr ? userToBlock(before) : null

  // Apply update
  const after: UserHr = {
    ...before,
    ...(identityFieldsOnly as Partial<UserHr>),
  }
  userStore.set(args.userId, after)

  // Always emit user.updated when any field changed (existing behaviour)
  if (changedFields.length > 0) {
    userUpdatedEmits.push({ userId: args.userId, changedFields })
  }

  // Emit employment.updated only when HR fields changed AND delta is non-empty
  if (willChangeHr && prevBlock) {
    const nextBlock = userToBlock(after)
    const { delta, previous } = diffEmployment(prevBlock, nextBlock)
    if (Object.keys(delta).length > 0) {
      employmentEmits.push({
        user: { portalSub: args.userId },
        employment: delta,
        previousEmployment: previous,
      })
    }
  }

  // suppress unused — these are intentionally captured but not asserted on by name
  void portalRole
  void name
}

describe('PATCH /v1/employees/:id — employment.updated emit wiring (PR 07-3)', () => {
  test('HR field change fires emitEmploymentUpdated with delta + previous', async () => {
    await patchHandler({
      userId: 'user-1',
      body: { position: 'Staff Engineer', phone: '+62-555-9999' },
    })

    expect(employmentEmits).toHaveLength(1)
    const emit = employmentEmits[0]
    expect(emit.user.portalSub).toBe('user-1')
    expect(emit.employment).toEqual({
      position: 'Staff Engineer',
      phone: '+62-555-9999',
    })
    expect(emit.previousEmployment).toEqual({
      position: 'Engineer',
      phone: '+62-555-0001',
    })
  })

  test('taxonomy field change is captured as a TaxonomyRef delta', async () => {
    await patchHandler({
      userId: 'user-1',
      body: { branch: 'TH-BKK' },
    })

    expect(employmentEmits).toHaveLength(1)
    expect(employmentEmits[0].employment.branch).toEqual({
      taxonomyId: 'branches',
      key: 'TH-BKK',
      value: 'TH-BKK',
    })
    expect(employmentEmits[0].previousEmployment.branch).toEqual({
      taxonomyId: 'branches',
      key: 'ID-JKT',
      value: 'ID-JKT',
    })
  })

  test('non-HR-only edit (portalRole) does NOT fire employment.updated but DOES fire user.updated', async () => {
    await patchHandler({
      userId: 'user-1',
      body: { portalRole: 'admin' },
    })

    expect(employmentEmits).toHaveLength(0)
    expect(userUpdatedEmits).toHaveLength(1)
    expect(userUpdatedEmits[0].changedFields).toEqual(['portalRole'])
  })

  test('name-only edit does NOT fire employment.updated', async () => {
    await patchHandler({
      userId: 'user-1',
      body: { name: 'New Name' },
    })

    expect(employmentEmits).toHaveLength(0)
    expect(userUpdatedEmits).toHaveLength(1)
  })

  test('mixed HR + non-HR edit fires both events', async () => {
    await patchHandler({
      userId: 'user-1',
      body: { position: 'Staff', portalRole: 'admin' },
    })

    expect(employmentEmits).toHaveLength(1)
    expect(employmentEmits[0].employment).toEqual({ position: 'Staff' })
    expect(userUpdatedEmits).toHaveLength(1)
    expect(userUpdatedEmits[0].changedFields.sort()).toEqual(['portalRole', 'position'].sort())
  })

  test('HR field set to same value emits user.updated but NOT employment.updated (no delta)', async () => {
    await patchHandler({
      userId: 'user-1',
      body: { position: 'Engineer' }, // same as current
    })

    expect(employmentEmits).toHaveLength(0)
    expect(userUpdatedEmits).toHaveLength(1)
  })
})
