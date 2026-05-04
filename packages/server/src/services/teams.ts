import * as teamsRepo from '../repositories/teams'
import { writeAuditLog } from './audit'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type {
  CreateTeamInput,
  UpdateTeamInput,
  ListTeamsInput,
} from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function listTeams(input: ListTeamsInput, ctx: ServiceContext) {
  const { rows, total } = await withRLS(ctx.actor, (db) =>
    teamsRepo.listTeams(
      {
        page: input.page,
        limit: input.limit,
        search: input.search,
      },
      db,
    ),
  )

  // Enrich with member counts
  const teamsWithCounts = await Promise.all(
    rows.map(async (team) => {
      const memberCount = await withRLS(ctx.actor, (db) =>
        teamsRepo.getTeamMemberCount(team.id, db),
      )
      return { ...team, memberCount }
    }),
  )

  return {
    teams: teamsWithCounts,
    meta: { total, page: input.page, limit: input.limit },
  }
}

export async function getTeamById(id: string, ctx: ServiceContext) {
  return withRLS(ctx.actor, async (db) => {
    const team = await teamsRepo.getTeamById(id, db)
    if (!team) {
      throw new TeamNotFoundError(id)
    }

    const members = await teamsRepo.getTeamMembers(id, db)
    const memberCount = members.length

    return { ...team, members, memberCount }
  })
}

export async function createTeam(input: CreateTeamInput, ctx: ServiceContext) {
  return withRLS(ctx.actor, async (db) => {
    const created = await teamsRepo.createTeam(
      {
        name: input.name,
        branchId: input.branchId,
        leaderId: input.leaderId ?? null,
      },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'TEAM_CREATED',
        entityType: 'teams',
        entityId: created.id,
        newValue: { name: created.name },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    return created
  })
}

export async function updateTeam(
  id: string,
  input: UpdateTeamInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const existing = await teamsRepo.getTeamById(id, db)
    if (!existing) {
      throw new TeamNotFoundError(id)
    }

    const updated = await teamsRepo.updateTeam(id, input, db)
    if (!updated) {
      throw new TeamNotFoundError(id)
    }

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'TEAM_UPDATED',
        entityType: 'teams',
        entityId: id,
        oldValue: { name: existing.name },
        newValue: input,
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    return updated
  })
}

// Domain errors
export class TeamNotFoundError extends Error {
  constructor(id: string) {
    super(`Team not found: ${id}`)
    this.name = 'TeamNotFoundError'
  }
}
