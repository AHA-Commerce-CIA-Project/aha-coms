import { eq, count, desc } from 'drizzle-orm'
import { challenges, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type ChallengeRow = typeof challenges.$inferSelect

type ListOpts = {
  readonly page: number
  readonly limit: number
}

export async function listByAchievement(
  achievementId: string,
  opts: ListOpts,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const where = eq(challenges.achievementId, achievementId)
  const offset = (opts.page - 1) * opts.limit

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: challenges.id,
        achievementId: challenges.achievementId,
        challengerId: challenges.challengerId,
        reason: challenges.reason,
        status: challenges.status,
        resolvedBy: challenges.resolvedBy,
        resolvedAt: challenges.resolvedAt,
        resolutionNote: challenges.resolutionNote,
        createdAt: challenges.createdAt,
        challengerName: heroesProfiles.name,
        challengerEmail: emailCache.contactEmail,
      })
      .from(challenges)
      .innerJoin(heroesProfiles, eq(challenges.challengerId, heroesProfiles.id))
      .leftJoin(emailCache, eq(challenges.challengerId, emailCache.portalSub))
      .where(where)
      .orderBy(desc(challenges.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(challenges).where(where),
  ])

  return { rows, total }
}

export async function getById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [row] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, id))
    .limit(1)
  return row ?? null
}

export async function getByIdWithDetails(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [result] = await db
    .select({
      challenge: challenges,
      challenger: {
        id: heroesProfiles.id,
        name: heroesProfiles.name,
        email: emailCache.contactEmail,
      },
    })
    .from(challenges)
    .innerJoin(heroesProfiles, eq(challenges.challengerId, heroesProfiles.id))
    .leftJoin(emailCache, eq(challenges.challengerId, emailCache.portalSub))
    .where(eq(challenges.id, id))
    .limit(1)
  return result ?? null
}

export async function create(
  data: typeof challenges.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(challenges).values(data).returning()
  return created
}

export async function resolve(
  id: string,
  data: {
    status: string
    resolvedBy: string
    resolvedAt: Date
    resolutionNote: string
  },
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [updated] = await db
    .update(challenges)
    .set(data)
    .where(eq(challenges.id, id))
    .returning()
  return updated ?? null
}
