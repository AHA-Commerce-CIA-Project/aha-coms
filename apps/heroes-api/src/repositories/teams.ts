import { eq, count, ilike, and } from 'drizzle-orm'
import { taxonomyCache, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type TeamRow = {
  id: string
  name: string
  key: string
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

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: taxonomyCache.key,
        name: taxonomyCache.value,
        key: taxonomyCache.key,
      })
      .from(taxonomyCache)
      .where(where)
      .orderBy(taxonomyCache.value)
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(taxonomyCache).where(where),
  ])

  return { rows, total }
}

export async function getTeamMembers(teamKey: string, tx?: DbClient) {
  const db = getDb(tx)
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
}

export async function getTeamMemberCount(teamKey: string, tx?: DbClient) {
  const db = getDb(tx)
  const [{ total }] = await db
    .select({ total: count() })
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
