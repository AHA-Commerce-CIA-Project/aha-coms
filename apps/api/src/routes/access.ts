import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { accessAuditLog, teamAppAccess, teamMembers, identityUsers, appRegistry } from '~/db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { resolveAndSyncClaims } from '../services/claims'
import { logAudit } from '../services/audit'
import { emitUserUpdated } from '../services/provisioning-events'

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
      console.error(`[provisioning-events] emitUserUpdated failed for ${userId}:`, err)
    })
  }
}

export const accessRoutes = new Elysia()
  .use(requireRole('admin'))

  .post(
    '/teams/:id/apps',
    async ({ params, body, set, authUser }) => {
      // Validate appRole against the app's declared roles (if provided)
      if (body.appRole) {
        const app = await db.query.appRegistry.findFirst({
          where: eq(appRegistry.id, body.appId),
          columns: { appRoles: true },
        })

        if (!app) {
          set.status = 404
          return { message: 'App not found' }
        }

        const declaredKeys = (app.appRoles ?? []).map((r) => r.key)
        if (!declaredKeys.includes(body.appRole)) {
          set.status = 400
          return { message: `Invalid appRole '${body.appRole}'. Valid roles: ${declaredKeys.join(', ') || '(none)'}` }
        }
      }

      const actor = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.gipUid, authUser.gipUid),
      })

      await db.insert(teamAppAccess).values({
        teamId: params.id,
        appId: body.appId,
        appRole: body.appRole ?? null,
        grantedBy: actor?.id,
      })

      await refreshTeamMemberClaims(params.id)

      await logAudit({
        actorId: authUser.id,
        action: 'grant_app_access',
        targetType: 'team',
        targetId: params.id,
        details: { appId: body.appId, appRole: body.appRole ?? null },
      })

      return { ok: true }
    },
    { body: t.Object({ appId: t.String(), appRole: t.Optional(t.String()) }) },
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
    },
  )

  .delete('/teams/:id/apps/:appId', async ({ params, authUser }) => {
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
    })

    return { ok: true }
  })
