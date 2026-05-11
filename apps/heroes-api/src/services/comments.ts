import { achievementPoints, challenges, appeals } from '@coms/shared/db/schema'
import { eq } from 'drizzle-orm'
import * as commentsRepo from '../repositories/comments'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type { CreateCommentInput, UpdateCommentInput, ListCommentsInput } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
}

const ENTITY_TABLE_MAP = {
  achievement: achievementPoints,
  challenge: challenges,
  appeal: appeals,
} as const

export async function createComment(
  input: CreateCommentInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    // Validate entity exists
    const table = ENTITY_TABLE_MAP[input.entityType]
    const [entity] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, input.entityId))
      .limit(1)

    if (!entity) throw new EntityNotFoundError(input.entityType, input.entityId)

    const created = await commentsRepo.create(
      {
        branchKey: ctx.actor.branchKey,
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: ctx.actor.id,
        body: input.body,
      },
      db,
    )

    return created
  })
}

export async function updateComment(
  commentId: string,
  input: UpdateCommentInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const comment = await commentsRepo.getById(commentId, db)
    if (!comment) throw new CommentNotFoundError(commentId)

    if (comment.authorId !== ctx.actor.id) throw new NotCommentAuthorError()

    const updated = await commentsRepo.update(commentId, input.body, db)
    return updated
  })
}

export async function listComments(
  input: ListCommentsInput,
  ctx: ServiceContext,
) {
  const { rows, total } = await withRLS(ctx.actor, (db) =>
    commentsRepo.listByEntity(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        page: input.page,
        limit: input.limit,
      },
      db,
    ),
  )

  return {
    comments: rows,
    meta: { total, page: input.page, limit: input.limit },
  }
}

// Domain errors
export class EntityNotFoundError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`${entityType} not found: ${entityId}`)
    this.name = 'EntityNotFoundError'
  }
}

export class CommentNotFoundError extends Error {
  constructor(id: string) {
    super(`Comment not found: ${id}`)
    this.name = 'CommentNotFoundError'
  }
}

export class NotCommentAuthorError extends Error {
  constructor() {
    super('Only the comment author can edit this comment')
    this.name = 'NotCommentAuthorError'
  }
}
