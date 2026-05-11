/**
 * Tests for employment-resolution: resolves the EmploymentBlock for a user
 * by joining identity_users HR fields against org_taxonomies for taxonomy-shaped
 * fields (branch, team, department), and computes the delta between two blocks.
 *
 * Spec 07 §Decisions: branch/team/department are { taxonomyId, key, value } refs.
 * Free-form fields (position, phone, leaderName, birthDate) are plain strings.
 * employmentStatus/talentaId/attendanceName don't exist in identity_users yet —
 * emitted as null in PR 07-3 and populated when their columns land later.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Sentinel table objects (reference-equality matching in select stub)
// ---------------------------------------------------------------------------

const identityUsers = {
  id: 'identityUsers.id',
  branch: 'identityUsers.branch',
  department: 'identityUsers.department',
}
const orgTaxonomies = {
  taxonomyId: 'orgTaxonomies.taxonomyId',
  key: 'orgTaxonomies.key',
  value: 'orgTaxonomies.value',
}

type UserRow = {
  id: string
  name: string
  branch: string | null
  department: string | null
  position: string | null
  phone: string | null
  leaderName: string | null
  birthDate: string | null
}

type TaxonomyRow = { taxonomyId: string; key: string; value: string }

let currentUser: UserRow | null = null
let taxonomyRows: TaxonomyRow[] = []

const db = {
  query: {
    identityUsers: {
      findFirst: async () => currentUser,
    },
  },
  select: (_fields: unknown) => ({
    from: (table: unknown) => ({
      where: async () => {
        if (table === orgTaxonomies) return taxonomyRows
        return []
      },
    }),
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({
  ...fullSchemaBarrelMock(),
  identityUsers,
  orgTaxonomies,
}))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

const { getEmploymentBlock, diffEmployment } =
  await import('../employment-resolution')

function setUser(overrides: Partial<UserRow> = {}): void {
  currentUser = {
    id: 'user-1',
    name: 'Jane Smith',
    branch: 'ID-JKT',
    department: 'ENG',
    position: 'Senior Engineer',
    phone: '+62-21-555-1234',
    leaderName: 'Lead Person',
    birthDate: '1990-04-15',
    ...overrides,
  }
}

function reset(): void {
  currentUser = null
  taxonomyRows = []
}

describe('getEmploymentBlock — taxonomy resolution', () => {
  beforeEach(reset)

  test('resolves branch + department from org_taxonomies and passes through free-form fields', async () => {
    setUser()
    taxonomyRows = [
      { taxonomyId: 'branches', key: 'ID-JKT', value: 'Indonesia – Jakarta' },
      { taxonomyId: 'departments', key: 'ENG', value: 'Engineering' },
    ]

    const block = await getEmploymentBlock('user-1')
    expect(block).not.toBeNull()
    expect(block!.branch).toEqual({
      taxonomyId: 'branches',
      key: 'ID-JKT',
      value: 'Indonesia – Jakarta',
    })
    expect(block!.department).toEqual({
      taxonomyId: 'departments',
      key: 'ENG',
      value: 'Engineering',
    })
    expect(block!.position).toBe('Senior Engineer')
    expect(block!.phone).toBe('+62-21-555-1234')
    expect(block!.leaderName).toBe('Lead Person')
    expect(block!.birthDate).toBe('1990-04-15')
  })

  test('falls back to {key: raw, value: raw} when taxonomy entry missing (seed period)', async () => {
    setUser({ branch: 'NEW-BRANCH', department: 'ENG' })
    taxonomyRows = [
      // Only ENG present; NEW-BRANCH not yet refined into the taxonomy
      { taxonomyId: 'departments', key: 'ENG', value: 'Engineering' },
    ]

    const block = await getEmploymentBlock('user-1')
    expect(block!.branch).toEqual({
      taxonomyId: 'branches',
      key: 'NEW-BRANCH',
      value: 'NEW-BRANCH',
    })
  })

  test('emits null for branch/department when user fields are null', async () => {
    setUser({ branch: null, department: null })
    taxonomyRows = []

    const block = await getEmploymentBlock('user-1')
    expect(block!.branch).toBeNull()
    expect(block!.department).toBeNull()
  })

  test('team is null until taxonomy + identity column wired (PR 07-3 placeholder)', async () => {
    setUser()

    const block = await getEmploymentBlock('user-1')
    expect(block!.team).toBeNull()
  })

  test('employmentStatus/talentaId/attendanceName emitted as null (no schema column yet)', async () => {
    setUser()

    const block = await getEmploymentBlock('user-1')
    expect(block!.employmentStatus).toBeNull()
    expect(block!.talentaId).toBeNull()
    expect(block!.attendanceName).toBeNull()
  })

  test('returns null when user not found', async () => {
    currentUser = null

    const block = await getEmploymentBlock('nonexistent')
    expect(block).toBeNull()
  })
})

describe('diffEmployment — delta computation', () => {
  const baseBlock = {
    branch: { taxonomyId: 'branches', key: 'ID-JKT', value: 'Jakarta' } as const,
    team: null,
    department: { taxonomyId: 'departments', key: 'ENG', value: 'Engineering' } as const,
    position: 'Senior Engineer',
    phone: '+62-21-555-1234',
    employmentStatus: null,
    talentaId: null,
    attendanceName: null,
    leaderName: 'Lead Person',
    birthDate: '1990-04-15',
  }

  test('returns empty delta + previous when blocks equal', () => {
    const result = diffEmployment(baseBlock, baseBlock)
    expect(result.delta).toEqual({})
    expect(result.previous).toEqual({})
  })

  test('captures only the changed scalar fields', () => {
    const next = { ...baseBlock, position: 'Staff Engineer', phone: '+62-21-999-9999' }
    const result = diffEmployment(baseBlock, next)
    expect(result.delta).toEqual({
      position: 'Staff Engineer',
      phone: '+62-21-999-9999',
    })
    expect(result.previous).toEqual({
      position: 'Senior Engineer',
      phone: '+62-21-555-1234',
    })
  })

  test('captures taxonomy field changes by structural inequality', () => {
    const next = {
      ...baseBlock,
      branch: { taxonomyId: 'branches', key: 'TH-BKK', value: 'Bangkok' } as const,
    }
    const result = diffEmployment(baseBlock, next)
    expect(result.delta.branch).toEqual({
      taxonomyId: 'branches',
      key: 'TH-BKK',
      value: 'Bangkok',
    })
    expect(result.previous.branch).toEqual({
      taxonomyId: 'branches',
      key: 'ID-JKT',
      value: 'Jakarta',
    })
    expect(Object.keys(result.delta)).toEqual(['branch'])
  })

  test('treats null → value as a change', () => {
    const prev = { ...baseBlock, position: null }
    const next = { ...baseBlock, position: 'New Title' }
    const result = diffEmployment(prev, next)
    expect(result.delta).toEqual({ position: 'New Title' })
    expect(result.previous).toEqual({ position: null })
  })
})
