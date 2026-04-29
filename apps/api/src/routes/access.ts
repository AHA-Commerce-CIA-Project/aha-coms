import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { accessAuditLog, teamAppAccess, teamMembers, identityUsers, appRegistry, memberAppRole } from '~/db/schema'
import { and, eq, desc, sql, inArray } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { resolveAndSyncClaims } from '../services/claims'
import { logAudit } from '../services/audit'
import { emitUserUpdated } from '../services/provisioning-events'
import { logger } from '~/logger'

async function refreshTeamMemberClaims(teamId: string): Promise<void> {
  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))

  for (const { userId } of members) {
    const user = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, userId),
    })
    if (user?.gipUid) {
      await resolveAndSyncClaims(user.gipUid, userId)
    }
    emitUserUpdated(userId, ['teamIds', 'apps']).catch((err) => {
      logger.error({ err, userId }, '[provisioning-events] emitUserUpdated failed')
    })
  }
}

export const accessRoutes = new Elysia()
  .use(requireRole('admin'))

  .post(
    '/teams/:id/apps',
    async ({ params, body, authUser, requestId, actorIp }) => {
      const actor = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.gipUid, authUser.gipUid),
      })

      await db.insert(teamAppAccess).values({
        teamId: params.id,
        appId: body.appId,
        grantedBy: actor?.id,
      })

      await refreshTeamMemberClaims(params.id)

      await logAudit({
        actorId: authUser.id,
        action: 'grant_app_access',
        targetType: 'team',
        targetId: params.id,
        details: { appId: body.appId },
        requestId,
        actorIp,
        targetAppId: body.appId,
      })

      return { ok: true }
    },
    {
      body: t.Object({ appId: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
      },
    },
  )

  .get(
    '/access/audit',
    async ({ query }) => {
      const page = Number(query.page ?? 1)
      const limit = Number(query.limit ?? 50)
      const offset = (page - 1) * limit

      const [rows, [{ count }]] = await Promise.all([
        db
          .select({
            id: accessAuditLog.id,
            action: accessAuditLog.action,
            targetType: accessAuditLog.targetType,
            targetId: accessAuditLog.targetId,
            details: accessAuditLog.details,
            createdAt: accessAuditLog.createdAt,
            actor: {
              name: identityUsers.name,
              email: identityUsers.email,
            },
          })
          .from(accessAuditLog)
          .leftJoin(identityUsers, eq(accessAuditLog.actorId, identityUsers.id))
          .orderBy(desc(accessAuditLog.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(accessAuditLog),
      ])

      return { entries: rows, total: Number(count), page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          entries: t.Array(t.Any()),
          total: t.Number(),
          page: t.Number(),
          limit: t.Number(),
        }),
      },
    },
  )

  .delete('/teams/:id/apps/:appId', async ({ params, authUser, requestId, actorIp }) => {
    // Also clean up per-member role assignments for this team's members
    const members = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, params.id))

    if (members.length > 0) {
      const memberUserIds = members.map((m) => m.userId)
      // Only delete roles for users who don't have access via another team
      for (const userId of memberUserIds) {
        const otherAccess = await db
          .select({ id: teamAppAccess.id })
          .from(teamAppAccess)
          .innerJoin(teamMembers, eq(teamMembers.teamId, teamAppAccess.teamId))
          .where(
            and(
              eq(teamMembers.userId, userId),
              eq(teamAppAccess.appId, params.appId),
              sql`${teamAppAccess.teamId} != ${params.id}`,
            ),
          )

        if (otherAccess.length === 0) {
          await db
            .delete(memberAppRole)
            .where(and(eq(memberAppRole.userId, userId), eq(memberAppRole.appId, params.appId)))
        }
      }
    }

    await db
      .delete(teamAppAccess)
      .where(and(eq(teamAppAccess.teamId, params.id), eq(teamAppAccess.appId, params.appId)))

    await refreshTeamMemberClaims(params.id)

    await logAudit({
      actorId: authUser.id,
      action: 'revoke_app_access',
      targetType: 'team',
      targetId: params.id,
      details: { appId: params.appId },
      requestId,
      actorIp,
      targetAppId: params.appId,
    })

    return { ok: true }
  }, { response: { 200: t.Object({ ok: t.Literal(true) }) } })

  // ---------------------------------------------------------------------------
  // Per-member app role management
  // ---------------------------------------------------------------------------

  .put(
    '/members/:userId/apps/:appId/role',
    async ({ params, body, set, authUser, requestId, actorIp }) => {
      // Validate the role against the app's declared roles
      const app = await db.query.appRegistry.findFirst({
        where: eq(appRegistry.id, params.appId),
        columns: { appRoles: true },
      })

      if (!app) {
        set.status = 404
        return { message: 'App not found' }
      }

      const declaredKeys = (app.appRoles ?? []).map((r) => r.key)
      if (declaredKeys.length > 0 && !declaredKeys.includes(body.appRole)) {
        set.status = 400
        return { message: `Invalid appRole '${body.appRole}'. Valid roles: ${declaredKeys.join(', ')}` }
      }

      const actor = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.gipUid, authUser.gipUid),
      })

      await db
        .insert(memberAppRole)
        .values({
          userId: params.userId,
          appId: params.appId,
          appRole: body.appRole,
          grantedBy: actor?.id,
        })
        .onConflictDoUpdate({
          target: [memberAppRole.userId, memberAppRole.appId],
          set: { appRole: body.appRole, grantedBy: actor?.id, grantedAt: new Date() },
        })

      // Refresh claims and emit webhook for the affected user
      const user = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.id, params.userId),
      })
      if (user?.gipUid) {
        await resolveAndSyncClaims(user.gipUid, params.userId)
      }
      emitUserUpdated(params.userId, ['appRole']).catch((err) => {
        logger.error({ err, userId: params.userId }, '[provisioning-events] emitUserUpdated failed')
      })

      await logAudit({
        actorId: authUser.id,
        action: 'set_member_app_role',
        targetType: 'user',
        targetId: params.userId,
        details: { appId: params.appId, appRole: body.appRole },
        requestId,
        actorIp,
        targetAppId: params.appId,
      })

      return { ok: true }
    },
    {
      body: t.Object({ appRole: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
    },
  )

  .delete('/members/:userId/apps/:appId/role', async ({ params, authUser, requestId, actorIp }) => {
    await db
      .delete(memberAppRole)
      .where(and(eq(memberAppRole.userId, params.userId), eq(memberAppRole.appId, params.appId)))

    const user = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, params.userId),
    })
    if (user?.gipUid) {
      await resolveAndSyncClaims(user.gipUid, params.userId)
    }
    emitUserUpdated(params.userId, ['appRole']).catch((err) => {
      logger.error({ err, userId: params.userId }, '[provisioning-events] emitUserUpdated failed')
    })

    await logAudit({
      actorId: authUser.id,
      action: 'remove_member_app_role',
      targetType: 'user',
      targetId: params.userId,
      details: { appId: params.appId },
      requestId,
      actorIp,
      targetAppId: params.appId,
    })

    return { ok: true }
  }, { response: { 200: t.Object({ ok: t.Literal(true) }) } })
