import { eq, and, count, desc } from 'drizzle-orm'
import { appeals, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type AppealRow = typeof appeals.$inferSelect

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
  const where = eq(appeals.achievementId, achievementId)
  const offset = (opts.page - 1) * opts.limit

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: appeals.id,
        achievementId: appeals.achievementId,
        appellantId: appeals.appellantId,
        reason: appeals.reason,
        status: appeals.status,
        resolvedBy: appeals.resolvedBy,
        resolvedAt: appeals.resolvedAt,
        resolutionNote: appeals.resolutionNote,
        createdAt: appeals.createdAt,
        appellantName: heroesProfiles.name,
        appellantEmail: emailCache.contactEmail,
      })
      .from(appeals)
      .innerJoin(heroesProfiles, eq(appeals.appellantId, heroesProfiles.id))
      .leftJoin(emailCache, eq(appeals.appellantId, emailCache.portalSub))
      .where(where)
      .orderBy(desc(appeals.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(appeals).where(where),
  ])

  return { rows, total }
}

export async function getById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [row] = await db
    .select()
    .from(appeals)
    .where(eq(appeals.id, id))
    .limit(1)
  return row ?? null
}

export async function getByIdWithDetails(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [result] = await db
    .select({
      appeal: appeals,
      appellant: {
        id: heroesProfiles.id,
        name: heroesProfiles.name,
        email: emailCache.contactEmail,
      },
    })
    .from(appeals)
    .innerJoin(heroesProfiles, eq(appeals.appellantId, heroesProfiles.id))
    .leftJoin(emailCache, eq(appeals.appellantId, emailCache.portalSub))
    .where(eq(appeals.id, id))
    .limit(1)
  return result ?? null
}

export async function findOpenByAchievementAndUser(
  achievementId: string,
  appellantId: string,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [row] = await db
    .select()
    .from(appeals)
    .where(
      and(
        eq(appeals.achievementId, achievementId),
        eq(appeals.appellantId, appellantId),
        eq(appeals.status, 'open'),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function create(
  data: typeof appeals.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(appeals).values(data).returning()
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
    .update(appeals)
    .set(data)
    .where(eq(appeals.id, id))
    .returning()
  return updated ?? null
}
