import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq, ilike, sql } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { generatePasswordResetLink } from '../gip-admin'
import { createEmployee, deactivateEmployee, batchUpdateEmployees } from '../services/employees'
import { importEmployeesFromGoogleAdminCsv } from '../services/employee-import'
import { processEmployeeProvisioning } from '../services/employee-provisioning'
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
        db
          .select({
            id: identityUsers.id,
            email: identityUsers.email,
            name: identityUsers.name,
            phone: identityUsers.phone,
            department: identityUsers.department,
            position: identityUsers.position,
            portalRole: identityUsers.portalRole,
            hasGoogleWorkspace: identityUsers.hasGoogleWorkspace,
            status: identityUsers.status,
            provisioningStatus: identityUsers.provisioningStatus,
            createdAt: identityUsers.createdAt,
            updatedAt: identityUsers.updatedAt,
          })
          .from(identityUsers)
          .where(where)
          .limit(limit)
          .offset(offset),
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
        actorId: authUser.id,
        action: 'create_employee',
        targetType: 'user',
        targetId: result.id,
        details: {
          email: body.email,
          provisioningStatus: result.provisioningStatus,
          ...(result.provisioningError ? { provisioningError: result.provisioningError } : {}),
        },
      })
      return result
    },
    { body: employeeBody },
  )

  .post(
    '/batch-update',
    async ({ body, authUser }) => {
      const count = await batchUpdateEmployees(body.ids, body.field, body.value)

      for (const id of body.ids) {
        await logAudit({
          actorId: authUser.id,
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

  .post(
    '/import-csv',
    async ({ body, authUser }) => {
      const result = await importEmployeesFromGoogleAdminCsv(body.csv, {
        preview: body.preview,
      })

      if (!body.preview) {
        for (const createdEmployee of result.created) {
          await logAudit({
            actorId: authUser.id,
            action: 'import_employee_csv',
            targetType: 'user',
            targetId: createdEmployee.id,
            details: {
              email: createdEmployee.email,
              rowNumber: createdEmployee.rowNumber,
              source: 'google_admin_csv',
            },
          })
        }
      }

      return result
    },
    {
      body: t.Object({
        csv: t.String({ minLength: 1 }),
        preview: t.Optional(t.Boolean()),
      }),
    },
  )

  .get('/:id', async ({ params, set }) => {
    const [user] = await db
      .select({
        id: identityUsers.id,
        email: identityUsers.email,
        name: identityUsers.name,
        phone: identityUsers.phone,
        department: identityUsers.department,
        position: identityUsers.position,
        portalRole: identityUsers.portalRole,
        hasGoogleWorkspace: identityUsers.hasGoogleWorkspace,
        status: identityUsers.status,
        provisioningStatus: identityUsers.provisioningStatus,
        provisioningError: identityUsers.provisioningError,
        createdAt: identityUsers.createdAt,
        updatedAt: identityUsers.updatedAt,
      })
      .from(identityUsers)
      .where(eq(identityUsers.id, params.id))
      .limit(1)
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
        actorId: authUser.id,
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
      actorId: authUser.id,
      action: 'deactivate_employee',
      targetType: 'user',
      targetId: params.id,
    })
    return { ok: true }
  })

  .post('/:id/retry-provisioning', async ({ params, authUser }) => {
    const result = await processEmployeeProvisioning(params.id)

    await logAudit({
      actorId: authUser.id,
      action: 'retry_employee_provisioning',
      targetType: 'user',
      targetId: params.id,
      details: {
        provisioningStatus: result.status,
        ...(result.error ? { provisioningError: result.error } : {}),
      },
    })

    return result
  })

  .post('/:id/reset-password', async ({ params, set }) => {
    const employee = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, params.id),
    })
    if (!employee) {
      set.status = 404
      return { message: 'Not found' }
    }
    if (!employee.gipUid) {
      set.status = 400
      return { message: 'Employee has not been provisioned yet' }
    }
    await generatePasswordResetLink(employee.email)
    return { ok: true, email: employee.email }
  })
