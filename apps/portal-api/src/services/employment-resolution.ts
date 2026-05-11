/**
 * Employment block resolution.
 *
 * Builds the EmploymentBlock for a user by joining identity_users HR fields
 * against org_taxonomies for taxonomy-shaped fields (branch, team, department).
 * Free-form fields (position, phone, leaderName, birthDate) pass through.
 *
 * Spec 07 §Decisions: branch/team/department are { taxonomyId, key, value }
 * refs. value is a denormalised display snapshot — consumers store it for
 * display without re-querying. During the seed period (PR 07-1) entries are
 * key==value; admin refines display values via the admin UI (PR 07-2).
 *
 * employmentStatus/talentaId/attendanceName are listed in the spec envelope
 * but don't yet exist as identity_users columns; they are emitted as null
 * until those columns land.
 *
 * team is also null in PR 07-3: identity_users has no taxonomy-shaped team
 * column today (the existing `teams` table is membership groups, a different
 * concept per Spec 07 TODO line 30). When the team taxonomy is wired up,
 * this resolver gains a real lookup.
 */

import { db } from '~/db'
import { identityUsers, orgTaxonomies } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { EmploymentBlock, TaxonomyRef } from '@coms-portal/shared'

export type { EmploymentBlock, TaxonomyRef }

// ---------------------------------------------------------------------------
// getEmploymentBlock
// ---------------------------------------------------------------------------

export async function getEmploymentBlock(userId: string): Promise<EmploymentBlock | null> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })
  if (!user) return null

  const lookupKeys: Array<{ taxonomyId: string; key: string }> = []
  if (user.branch) lookupKeys.push({ taxonomyId: 'branches', key: user.branch })
  if (user.department) lookupKeys.push({ taxonomyId: 'departments', key: user.department })

  let taxonomyMap = new Map<string, string>()
  if (lookupKeys.length > 0) {
    const taxonomyIds = [...new Set(lookupKeys.map((l) => l.taxonomyId))]
    const rows = await db
      .select({
        taxonomyId: orgTaxonomies.taxonomyId,
        key: orgTaxonomies.key,
        value: orgTaxonomies.value,
      })
      .from(orgTaxonomies)
      .where(inArray(orgTaxonomies.taxonomyId, taxonomyIds))

    taxonomyMap = new Map(rows.map((r) => [`${r.taxonomyId}:${r.key}`, r.value]))
  }

  return {
    branch: resolveRef('branches', user.branch, taxonomyMap),
    team: null,
    department: resolveRef('departments', user.department, taxonomyMap),
    position: user.position ?? null,
    phone: user.phone ?? null,
    employmentStatus: null,
    talentaId: null,
    attendanceName: null,
    leaderName: user.leaderName ?? null,
    birthDate: user.birthDate ?? null,
  }
}

function resolveRef(
  taxonomyId: string,
  rawKey: string | null | undefined,
  taxonomyMap: Map<string, string>,
): TaxonomyRef | null {
  if (!rawKey) return null
  const value = taxonomyMap.get(`${taxonomyId}:${rawKey}`) ?? rawKey
  return { taxonomyId, key: rawKey, value }
}

// ---------------------------------------------------------------------------
// diffEmployment
// ---------------------------------------------------------------------------

export interface EmploymentDiff {
  delta: Partial<EmploymentBlock>
  previous: Partial<EmploymentBlock>
}

const EMPLOYMENT_FIELDS: Array<keyof EmploymentBlock> = [
  'branch',
  'team',
  'department',
  'position',
  'phone',
  'employmentStatus',
  'talentaId',
  'attendanceName',
  'leaderName',
  'birthDate',
]

export function diffEmployment(prev: EmploymentBlock, next: EmploymentBlock): EmploymentDiff {
  const delta: Partial<EmploymentBlock> = {}
  const previous: Partial<EmploymentBlock> = {}

  for (const field of EMPLOYMENT_FIELDS) {
    if (!fieldsEqual(prev[field], next[field])) {
      // Cast: TS can't widen the union of property assignments in a generic loop.
      ;(delta as Record<string, unknown>)[field] = next[field]
      ;(previous as Record<string, unknown>)[field] = prev[field]
    }
  }

  return { delta, previous }
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a === 'object' && typeof b === 'object') {
    const ar = a as Record<string, unknown>
    const br = b as Record<string, unknown>
    return ar.taxonomyId === br.taxonomyId && ar.key === br.key && ar.value === br.value
  }
  return false
}

// ---------------------------------------------------------------------------
// HR-field changeset detection (used by employees PATCH route)
// ---------------------------------------------------------------------------

/**
 * The set of identity_users column names that map to HR fields tracked by the
 * employment block. Used by the PATCH route to decide whether an update should
 * fire employment.updated.
 */
export const HR_FIELD_NAMES = [
  'branch',
  'department',
  'position',
  'phone',
  'leaderName',
  'birthDate',
] as const
export type HrFieldName = (typeof HR_FIELD_NAMES)[number]

export function hasHrFieldChanges(updateKeys: readonly string[]): boolean {
  return updateKeys.some((k) => (HR_FIELD_NAMES as readonly string[]).includes(k))
}
