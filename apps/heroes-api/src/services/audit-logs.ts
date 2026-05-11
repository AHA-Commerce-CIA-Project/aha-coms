import * as auditLogsRepo from '../repositories/audit-logs'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type { ListAuditLogsInput } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
}

export async function listAuditLogs(input: ListAuditLogsInput, ctx: ServiceContext) {
  if (ctx.actor.role !== 'admin' && ctx.actor.role !== 'hr') {
    throw new InsufficientRoleError()
  }

  // Admin and HR see all branches
  const branchKey = ctx.actor.role === 'admin' || ctx.actor.role === 'hr' ? null : ctx.actor.branchKey

  const { rows, total } = await withRLS(ctx.actor, (db) =>
    auditLogsRepo.listAuditLogs(input, branchKey, db),
  )

  return {
    logs: rows,
    meta: { total, page: input.page, limit: input.limit },
  }
}

export class InsufficientRoleError extends Error {
  constructor() {
    super('Insufficient role for this action')
    this.name = 'InsufficientRoleError'
  }
}
