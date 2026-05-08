import * as usersRepo from '../repositories/users'
import { writeAuditLog } from './audit'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type {
  UpdateUserInput,
  ListUsersInput,
} from '@coms/shared/schemas'
import type { BulkUserActionInput, BulkResult, BulkResultItem } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function listUsers(input: ListUsersInput, ctx: ServiceContext) {
  const { rows, total } = await withRLS(ctx.actor, (db) =>
    usersRepo.listUsers(
      {
        page: input.page,
        limit: input.limit,
        role: input.role,
        teamId: input.teamId,
        search: input.search,
        isActive: input.isActive,
        department: input.department,
        position: input.position,
        branchKey: input.branchKey,
      },
      db,
    ),
  )

  return {
    users: rows,
    meta: { total, page: input.page, limit: input.limit },
  }
}

export async function getUserById(id: string, ctx: ServiceContext) {
  const user = await withRLS(ctx.actor, (db) => usersRepo.getUserById(id, db))
  if (!user) {
    throw new UserNotFoundError(id)
  }
  return user
}

export async function createUser(_input: unknown, _ctx: ServiceContext): Promise<never> {
  throw new Error('User creation is owned by the portal webhook broker. Use the provisioning flow.')
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const existing = await usersRepo.getUserById(id, db)
    if (!existing) {
      throw new UserNotFoundError(id)
    }

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'USER_UPDATED',
        entityType: 'users',
        entityId: id,
        oldValue: {
          name: existing.name,
          role: existing.role,
          teamKey: existing.teamKey,
          position: existing.position,
        },
        newValue: input,
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    return existing
  })
}

export async function archiveUser(id: string, ctx: ServiceContext) {
  if (id === ctx.actor.id) {
    throw new CannotArchiveSelfError()
  }

  return withRLS(ctx.actor, async (db) => {
    const existing = await usersRepo.getUserById(id, db)
    if (!existing) {
      throw new UserNotFoundError(id)
    }

    if (!existing.isActive) {
      throw new UserAlreadyArchivedError(id)
    }

    const archived = await usersRepo.archiveUser(id, db)

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'USER_ARCHIVED',
        entityType: 'users',
        entityId: id,
        oldValue: { isActive: true },
        newValue: { isActive: false, archivedAt: archived?.archivedAt },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    return archived
  })
}

export async function activateUser(id: string, ctx: ServiceContext) {
  if (id === ctx.actor.id) {
    throw new CannotModifySelfError()
  }

  return withRLS(ctx.actor, async (db) => {
    const existing = await usersRepo.getUserById(id, db)
    if (!existing) throw new UserNotFoundError(id)
    if (existing.isActive) throw new UserAlreadyActiveError(id)

    const activated = await usersRepo.activateUser(id, db)

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'USER_ACTIVATED',
        entityType: 'users',
        entityId: id,
        oldValue: { isActive: false },
        newValue: { isActive: true },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    return activated
  })
}

export async function bulkToggleUsers(
  input: BulkUserActionInput,
  ctx: ServiceContext,
): Promise<BulkResult> {
  const results: BulkResultItem[] = []

  for (const id of input.ids) {
    try {
      if (input.action === 'archive') {
        await archiveUser(id, ctx)
      } else {
        await activateUser(id, ctx)
      }
      results.push({ id, success: true })
    } catch (err) {
      results.push({ id, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const succeeded = results.filter((r) => r.success).length
  return { processed: input.ids.length, succeeded, failed: input.ids.length - succeeded, results }
}

// Domain errors
export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`)
    this.name = 'UserNotFoundError'
  }
}

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already in use: ${email}`)
    this.name = 'EmailAlreadyExistsError'
  }
}

export class CannotArchiveSelfError extends Error {
  constructor() {
    super('Cannot archive your own account')
    this.name = 'CannotArchiveSelfError'
  }
}

export class UserAlreadyArchivedError extends Error {
  constructor(id: string) {
    super(`User already archived: ${id}`)
    this.name = 'UserAlreadyArchivedError'
  }
}

export class CannotModifySelfError extends Error {
  constructor() {
    super('Cannot modify your own account')
    this.name = 'CannotModifySelfError'
  }
}

export class UserAlreadyActiveError extends Error {
  constructor(id: string) {
    super(`User is already active: ${id}`)
    this.name = 'UserAlreadyActiveError'
  }
}
