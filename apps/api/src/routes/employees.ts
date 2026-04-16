import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq, ilike, sql } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { generatePasswordResetLink } from '../gip-admin'
import { createEmployee, deactivateEmployee, batchUpdateEmployees } from '../services/employees'
import { resolveAndSyncClaims } from '../services/claims'
import { logAudit } from '../services/audit'

const employeeBody = t.Object({
  email: t.String({ format: 'email' }),
  name: t.String({ minLength: 1 }),
  phone: t.Optional(t.String()),
  department: t.Optional(t.String()),
  position: t.Optional(t.String()),
  portalRole: t.Optional(
    t.Union([t.Literal('employee'), t.Literal('admin'), t.Literal('super_admin')]),
  ),
  teamId: t.Optional(t.String()),
  hasGoogleWorkspace: t.Optional(t.Boolean()),
})

export const employeeRoutes = new Elysia({ prefix: '/employees' })
  .use(requireRole('admin', 'super_admin'))

  .get(
    '/',
    async ({ query }) => {
      const page = Number(query.page ?? 1)
      const limit = Number(query.limit ?? 20)
      const offset = (page - 1) * limit
      const where = query.search ? ilike(identityUsers.email, `%${query.search}%`) : undefined

      const [rows, [{ count }]] = await Promise.all([
        db.select().from(identityUsers).where(where).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(identityUsers).where(where),
      ])

      return { data: rows, total: Number(count), page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )

  .post(
    '/',
    async ({ body, authUser }) => {
      const result = await createEmployee(body)
      await logAudit({
        actorId: authUser.gipUid,
        action: 'create_employee',
        targetType: 'user',
        targetId: result.id,
        details: { email: body.email },
      })
      return { id: result.id }
    },
    { body: employeeBody },
  )

  .post(
    '/batch-update',
    async ({ body, authUser }) => {
      const count = await batchUpdateEmployees(body.ids, body.field, body.value)

      for (const id of body.ids) {
        await logAudit({
          actorId: authUser.gipUid,
          action: 'batch_update_employee',
          targetType: 'user',
          targetId: id,
          details: { field: body.field, value: body.value },
        })
      }

      return { ok: true, count }
    },
    {
      body: t.Object({
        ids: t.Array(t.String(), { minItems: 1 }),
        field: t.Union([t.Literal('portalRole')]),
        value: t.String({ minLength: 1 }),
      }),
    },
  )

  .get('/:id', async ({ params, set }) => {
    const user = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, params.id),
    })
    if (!user) {
      set.status = 404
      return { message: 'Not found' }
    }
    return user
  })

  .patch(
    '/:id',
    async ({ params, body, authUser }) => {
      await db
        .update(identityUsers)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(identityUsers.id, params.id))

      if (body.portalRole) {
        const user = await db.query.identityUsers.findFirst({
          where: eq(identityUsers.id, params.id),
        })
        if (user?.gipUid) {
          await resolveAndSyncClaims(user.gipUid, params.id)
        }
      }

      await logAudit({
        actorId: authUser.gipUid,
        action: 'update_employee',
        targetType: 'user',
        targetId: params.id,
        details: body.portalRole ? { portalRole: body.portalRole } : undefined,
      })
      return { ok: true }
    },
    { body: t.Partial(employeeBody) },
  )

  .delete('/:id', async ({ params, authUser }) => {
    await deactivateEmployee(params.id)
    await logAudit({
      actorId: authUser.gipUid,
      action: 'deactivate_employee',
      targetType: 'user',
      targetId: params.id,
    })
    return { ok: true }
  })

  .post('/:id/reset-password', async ({ params, set }) => {
    const employee = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, params.id),
    })
    if (!employee) {
      set.status = 404
      return { message: 'Not found' }
    }
    await generatePasswordResetLink(employee.email)
    return { ok: true, email: employee.email }
  })
