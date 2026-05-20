import { eq, ilike, and, sql } from 'drizzle-orm'
import { taxonomyCache, heroesProfiles, emailCache } from '@coms-portal/heroes-shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type TeamRow = {
  id: string
  name: string
  key: string
  memberCount: number
}

export async function listTeams(
  opts: { page: number; limit: number; search?: string },
  tx?: DbClient,
) {
  const db = getDb(tx)
  const offset = (opts.page - 1) * opts.limit
  const conditions = [eq(taxonomyCache.taxonomyId, 'teams')]

  if (opts.search) conditions.push(ilike(taxonomyCache.value, `%${opts.search}%`))

  const where = and(...conditions)

  // T1.9: Replace per-row correlated subquery with a single LEFT JOIN + GROUP BY
  // aggregating active member counts in one pass over heroesProfiles.
  const memberCounts = db
    .select({
      teamKey: heroesProfiles.teamKey,
      memberCount: sql<number>`count(*)::int`.as('member_count'),
    })
    .from(heroesProfiles)
    .where(eq(heroesProfiles.isActive, true))
    .groupBy(heroesProfiles.teamKey)
    .as('member_counts')

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: taxonomyCache.key,
        name: taxonomyCache.value,
        key: taxonomyCache.key,
        memberCount: sql<number>`coalesce(${memberCounts.memberCount}, 0)`,
      })
      .from(taxonomyCache)
      .leftJoin(memberCounts, eq(memberCounts.teamKey, taxonomyCache.key))
      .where(where)
      .orderBy(taxonomyCache.value)
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(taxonomyCache).where(where),
  ])

  return { rows, total }
}

const TEAM_MEMBERS_MAX_LIMIT = 200
const TEAM_MEMBERS_DEFAULT_LIMIT = 50

// T1.10: Add limit + offset pagination; default limit 50, max 200.
// Clamps limit to [1, 200] and offset to [0, ∞).
export async function getTeamMembers(
  teamKey: string,
  opts: { limit?: number; offset?: number } = {},
  tx?: DbClient,
) {
  const db = getDb(tx)
  const limit = Math.min(Math.max(opts.limit ?? TEAM_MEMBERS_DEFAULT_LIMIT, 1), TEAM_MEMBERS_MAX_LIMIT)
  const offset = Math.max(opts.offset ?? 0, 0)
  return db
    .select({
      id: heroesProfiles.id,
      name: heroesProfiles.name,
      email: emailCache.contactEmail,
      position: heroesProfiles.position,
      isActive: heroesProfiles.isActive,
    })
    .from(heroesProfiles)
    .leftJoin(emailCache, eq(heroesProfiles.id, emailCache.portalSub))
    .where(and(eq(heroesProfiles.teamKey, teamKey), eq(heroesProfiles.isActive, true)))
    .orderBy(heroesProfiles.name)
    .limit(limit)
    .offset(offset)
}

export async function getTeamMemberCount(teamKey: string, tx?: DbClient) {
  const db = getDb(tx)
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(heroesProfiles)
    .where(and(eq(heroesProfiles.teamKey, teamKey), eq(heroesProfiles.isActive, true)))
  return total
}

export async function getTeamById(key: string, tx?: DbClient) {
  const db = getDb(tx)
  const [row] = await db
    .select({
      id: taxonomyCache.key,
      name: taxonomyCache.value,
      key: taxonomyCache.key,
    })
    .from(taxonomyCache)
    .where(and(eq(taxonomyCache.taxonomyId, 'teams'), eq(taxonomyCache.key, key)))
    .limit(1)
  return row ?? null
}

export async function createTeam(
  _data: { name: string; branchKey?: string; leaderId?: string | null },
  _tx?: DbClient,
): Promise<TeamRow> {
  throw new Error('Teams are managed by the portal taxonomy feed. Direct creation is not supported.')
}

export async function updateTeam(
  _id: string,
  _data: { name?: string; leaderId?: string | null },
  _tx?: DbClient,
): Promise<TeamRow | null> {
  throw new Error('Teams are managed by the portal taxonomy feed. Direct update is not supported.')
}
