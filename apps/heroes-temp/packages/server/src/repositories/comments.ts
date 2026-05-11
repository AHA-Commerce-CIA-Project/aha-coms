import { eq, and, count, asc } from 'drizzle-orm'
import { comments, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type CommentRow = typeof comments.$inferSelect

type ListOpts = {
  readonly entityType: string
  readonly entityId: string
  readonly page: number
  readonly limit: number
}

export async function listByEntity(opts: ListOpts, tx?: DbClient) {
  const db = getDb(tx)
  const where = and(
    eq(comments.entityType, opts.entityType),
    eq(comments.entityId, opts.entityId),
  )
  const offset = (opts.page - 1) * opts.limit

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        authorId: comments.authorId,
        body: comments.body,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorName: heroesProfiles.name,
        authorEmail: emailCache.contactEmail,
      })
      .from(comments)
      .innerJoin(heroesProfiles, eq(comments.authorId, heroesProfiles.id))
      .leftJoin(emailCache, eq(comments.authorId, emailCache.portalSub))
      .where(where)
      .orderBy(asc(comments.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(comments).where(where),
  ])

  return { rows, total }
}

export async function getById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [row] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1)
  return row ?? null
}

export async function create(
  data: typeof comments.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(comments).values(data).returning()
  return created
}

export async function update(id: string, body: string, tx?: DbClient) {
  const db = getDb(tx)
  const [updated] = await db
    .update(comments)
    .set({ body })
    .where(eq(comments.id, id))
    .returning()
  return updated ?? null
}
